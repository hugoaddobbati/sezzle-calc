import { describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR, UNEXPECTED_RESPONSE, calculate } from './api';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('calculate', () => {
  it('posts the calculation and returns the result', async () => {
    const fetchMock = mockFetch(200, { result: '3', rounded: false });

    await expect(calculate('12', 'divide', '4')).resolves.toEqual({ ok: true, result: '3', rounded: false });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number1: '12', operation: 'divide', number2: '4' }),
    });
  });

  it('leaves number2 out for square roots', async () => {
    const fetchMock = mockFetch(200, { result: '4', rounded: false });
    await calculate('16', 'sqrt');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ number1: '16', operation: 'sqrt' });
  });

  it('passes on whether the backend rounded the result', async () => {
    mockFetch(200, { result: '0.3333333333', rounded: true });
    await expect(calculate('1', 'divide', '3')).resolves.toEqual({
      ok: true,
      result: '0.3333333333',
      rounded: true,
    });
  });

  it('returns the backend error as-is', async () => {
    mockFetch(422, {
      code: 'RESULT_TOO_LARGE',
      message: 'The result would be too large (over 10000 digits).',
    });
    await expect(calculate('9', 'power', '999999999')).resolves.toEqual({
      ok: false,
      error: {
        code: 'RESULT_TOO_LARGE',
        message: 'The result would be too large (over 10000 digits).',
        field: undefined,
      },
    });
  });

  it('keeps the field when the backend names one', async () => {
    mockFetch(422, {
      code: 'DIVISION_BY_ZERO',
      message: 'Division by zero is not permitted.',
      field: 'number2',
    });
    const outcome = await calculate('5', 'divide', '0');
    expect(outcome).toMatchObject({ ok: false, error: { field: 'number2' } });
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(calculate('1', 'add', '1')).resolves.toEqual({ ok: false, error: NETWORK_ERROR });
  });

  it('treats a non-JSON 5xx from the proxy as the server being unreachable', async () => {
    mockFetch(502, new SyntaxError('Unexpected token <'));
    await expect(calculate('1', 'add', '1')).resolves.toEqual({ ok: false, error: NETWORK_ERROR });
  });

  it.each([
    ['non-JSON 4xx', 404, new SyntaxError('bad')],
    ['JSON that is not an object', 200, ['3']],
    ['success without a result', 200, { value: 3, rounded: false }],
    ['success without rounded', 200, { result: '3' }],
    ['error without a code', 400, { message: 'nope' }],
  ])('rejects %s', async (_name, status, body) => {
    mockFetch(status, body);
    await expect(calculate('1', 'add', '1')).resolves.toEqual({ ok: false, error: UNEXPECTED_RESPONSE });
  });
});
