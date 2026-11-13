import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { HISTORY_KEY } from './lib/history';

/** A fetch stub that answers each request with the next response in the list. */
function mockBackend(...responses: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const { status, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok: status < 300, status, json: () => Promise.resolve(body) });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function clickKeys(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  for (const name of names) {
    await user.click(screen.getByRole('button', { name }));
  }
}

const display = () => screen.getByTestId('display');

describe('App', () => {
  it('calculates through the backend and records the result in history', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ status: 200, body: { result: '3', rounded: false } });
    render(<App />);

    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
    await clickKeys(user, '1', '2', 'Divide');
    // The chosen operator is highlighted until the second number is typed.
    expect(screen.getByRole('button', { name: 'Divide' })).toHaveAttribute('aria-pressed', 'true');
    await clickKeys(user, '4');
    expect(screen.getByRole('button', { name: 'Divide' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('expression')).toHaveTextContent('12 ÷');

    await clickKeys(user, 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('3'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const history = screen.getByRole('region', { name: 'Recent calculations' });
    expect(within(history).getByText('12 ÷ 4 = 3')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(HISTORY_KEY)!)).toHaveLength(1);
  });

  it('catches division by zero without calling the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend();
    render(<App />);

    await clickKeys(user, '5', 'Divide', '0', 'Equals');

    expect(await screen.findByRole('alert')).toHaveTextContent('Division by zero is not permitted.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
  });

  it('shows errors that only the backend detects', async () => {
    const user = userEvent.setup();
    mockBackend({
      status: 422,
      body: { code: 'RESULT_TOO_LARGE', message: 'The result would be too large (over 10000 digits).' },
    });
    render(<App />);

    await clickKeys(user, '9', 'Power', '9', '9', '9', '9', '9', 'Equals');

    expect(await screen.findByRole('alert')).toHaveTextContent('The result would be too large');
  });

  it('shows a message when the server is unreachable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<App />);

    await clickKeys(user, '1', 'Add', '1', 'Equals');

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.");
  });

  it('chains calculations and applies square root immediately', async () => {
    const user = userEvent.setup();
    mockBackend(
      { status: 200, body: { result: '5', rounded: false } },
      { status: 200, body: { result: '25', rounded: false } },
      { status: 200, body: { result: '5', rounded: false } },
    );
    render(<App />);

    await clickKeys(user, '2', 'Add', '3', 'Add');
    await waitFor(() => expect(screen.getByTestId('expression')).toHaveTextContent('5 +'));
    await clickKeys(user, '2', '0', 'Equals');
    await waitFor(() => expect(display()).toHaveTextContent('25'));
    await clickKeys(user, 'Square root');
    await waitFor(() => expect(display()).toHaveTextContent(/^5$/));

    const items = within(screen.getByRole('region', { name: 'Recent calculations' })).getAllByRole(
      'listitem',
    );
    // Newest first; each row also shows the time.
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('√25 = 5'),
      expect.stringContaining('5 + 20 = 25'),
      expect.stringContaining('2 + 3 = 5'),
    ]);
  });

  it('works from the physical keyboard', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ status: 200, body: { result: '42', rounded: false } });
    render(<App />);

    await user.keyboard('6*7{Enter}');

    await waitFor(() => expect(display()).toHaveTextContent('42'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      number1: '6',
      operation: 'multiply',
      number2: '7',
    });

    await user.keyboard('{Escape}');
    expect(display()).toHaveTextContent(/^0$/);
  });

  it('multiplies by a negative number typed as 5*-3', async () => {
    const user = userEvent.setup();
    const fetchMock = mockBackend({ status: 200, body: { result: '-15', rounded: false } });
    render(<App />);

    await user.keyboard('5*-3{Enter}');

    await waitFor(() => expect(display()).toHaveTextContent('-15'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      number1: '5',
      operation: 'multiply',
      number2: '-3',
    });
    expect(screen.getByText('5 × -3 = -15')).toBeInTheDocument();
  });

  it('shows when a result was rounded', async () => {
    const user = userEvent.setup();
    mockBackend({ status: 200, body: { result: '0.3333333333', rounded: true } });
    render(<App />);

    await clickKeys(user, '1', 'Divide', '3', 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('0.3333333333'));
    expect(screen.getByText('Rounded to 10 decimal places')).toBeInTheDocument();
    expect(screen.getByText('1 ÷ 3 ≈ 0.3333333333')).toBeInTheDocument();

    await clickKeys(user, '7');
    expect(screen.queryByText('Rounded to 10 decimal places')).not.toBeInTheDocument();
  });

  it('formats long numbers for reading but sends them plain', async () => {
    const user = userEvent.setup();
    const big = '1' + '0'.repeat(24); // 25 digits
    const fetchMock = mockBackend({ status: 200, body: { result: big, rounded: false } });
    render(<App />);

    await clickKeys(user, '1', '2', '3', '4', '5');
    expect(display()).toHaveTextContent(/^12,345$/);
    await clickKeys(user, 'Power', '2', '4');
    expect(screen.getByTestId('expression')).toHaveTextContent('12,345 ^');
    await clickKeys(user, 'Equals');

    await waitFor(() => expect(display()).toHaveTextContent('1,000,000,000,000,000,000,000,000'));
    expect(screen.getByText('25 digits')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ number1: '12345', number2: '24' });

    const row = screen.getByText(/^12,345 \^ 24 = 1,000,000/);
    expect(row).toHaveAttribute('title', row.textContent);
  });

  it('ignores an answer that arrives after the user pressed clear', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await clickKeys(user, '1', 'Add', '1', 'Equals');
    await clickKeys(user, 'Clear');
    // The in-flight request is cancelled...
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    // ...and even if an answer still arrives, it is ignored.
    answer({ ok: true, status: 200, json: () => Promise.resolve({ result: '2', rounded: false }) });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(display()).toHaveTextContent(/^0$/);
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
  });

  it('ignores keyboard shortcuts with Ctrl, Alt or Meta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}5{/Control}{Alt>}6{/Alt}');
    expect(display()).toHaveTextContent(/^0$/);
  });

  it('loads saved history on start', () => {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ number1: '16', operation: 'sqrt', result: '4', timestamp: Date.now() }]),
    );
    render(<App />);
    expect(screen.getByText('√16 = 4')).toBeInTheDocument();
  });
});
