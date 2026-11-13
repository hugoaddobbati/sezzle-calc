import { describe, expect, it, vi } from 'vitest';
import { runCalculation, toHistoryEntry } from './calculation';

describe('runCalculation', () => {
  it('stops at local validation without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await runCalculation({
      operation: 'divide',
      number1: '5',
      number2: '0',
      chainedOperation: null,
    });

    expect(outcome).toMatchObject({ ok: false, error: { code: 'DIVISION_BY_ZERO' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a square root without number2, with the abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: '4', rounded: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const outcome = await runCalculation(
      { operation: 'sqrt', number1: '16', replaces: 'number1' },
      controller.signal,
    );

    expect(outcome).toEqual({ ok: true, result: '4', rounded: false });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ number1: '16', operation: 'sqrt' });
    expect(init.signal).toBe(controller.signal);
  });
});

describe('toHistoryEntry', () => {
  it('keeps both numbers for two-number operations', () => {
    expect(
      toHistoryEntry(
        { operation: 'divide', number1: '1', number2: '3', chainedOperation: 'add' },
        '0.3333333333',
        true,
        7,
      ),
    ).toEqual({
      operation: 'divide',
      number1: '1',
      number2: '3',
      result: '0.3333333333',
      rounded: true,
      timestamp: 7,
    });
  });

  it('keeps one number for square roots', () => {
    expect(toHistoryEntry({ operation: 'sqrt', number1: '16', replaces: 'number2' }, '4', false, 7)).toEqual({
      operation: 'sqrt',
      number1: '16',
      result: '4',
      rounded: false,
      timestamp: 7,
    });
  });

  it('defaults the timestamp to now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    expect(
      toHistoryEntry({ operation: 'sqrt', number1: '4', replaces: 'number1' }, '2', false).timestamp,
    ).toBe(42);
  });
});
