import type { Operation } from './operations';

/** The error shape shared by the backend and the frontend's own checks. */
export interface CalcError {
  code: string;
  message: string;
  field?: string;
}

export type CalculateOutcome =
  { ok: true; result: string; rounded: boolean } | { ok: false; error: CalcError };

/** Shown when the request never gets a real answer from the backend. */
export const NETWORK_ERROR: CalcError = {
  code: 'NETWORK_ERROR',
  message: "Can't reach the server. Please try again.",
};

/** Shown when the backend answers with something outside the API contract. */
export const UNEXPECTED_RESPONSE: CalcError = {
  code: 'UNEXPECTED_RESPONSE',
  message: 'Something went wrong. Please try again.',
};

const ENDPOINT = '/api/v1/calculate';

/**
 * Sends one calculation to the backend. Never throws: every outcome is either
 * a result or a CalcError whose message can be shown to the user as-is.
 */
export async function calculate(
  number1: string,
  operation: Operation,
  number2?: string,
  signal?: AbortSignal,
): Promise<CalculateOutcome> {
  const body = operation === 'sqrt' ? { number1, operation } : { number1, operation, number2 };

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // The Go server always answers in JSON, so a non-JSON 5xx comes from the
    // proxy in front of it: the backend is down or unreachable.
    return { ok: false, error: response.status >= 500 ? NETWORK_ERROR : UNEXPECTED_RESPONSE };
  }

  if (!isRecord(data)) {
    return { ok: false, error: UNEXPECTED_RESPONSE };
  }
  if (response.ok && typeof data.result === 'string' && typeof data.rounded === 'boolean') {
    return { ok: true, result: data.result, rounded: data.rounded };
  }
  if (!response.ok && typeof data.code === 'string' && typeof data.message === 'string') {
    return {
      ok: false,
      error: {
        code: data.code,
        message: data.message,
        field: typeof data.field === 'string' ? data.field : undefined,
      },
    };
  }
  return { ok: false, error: UNEXPECTED_RESPONSE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
