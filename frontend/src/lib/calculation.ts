import { calculate, type CalculateOutcome } from './api';
import type { HistoryEntry } from './history';
import type { CalculationRequest } from './keypad';
import { validate } from './validation';

/**
 * Checks a keypad request against the input rules, and only sends it to the
 * backend if it passes. A local failure never reaches the network.
 */
export async function runCalculation(
  request: CalculationRequest,
  signal?: AbortSignal,
): Promise<CalculateOutcome> {
  const number2 = request.operation === 'sqrt' ? undefined : request.number2;
  const invalid = validate(request.number1, request.operation, number2 ?? '');
  if (invalid) return { ok: false, error: invalid };
  return calculate(request.number1, request.operation, number2, signal);
}

/** The history entry for a successful calculation. */
export function toHistoryEntry(
  request: CalculationRequest,
  result: string,
  rounded: boolean,
  timestamp: number = Date.now(),
): HistoryEntry {
  const saved = { number1: request.number1, result, rounded, timestamp };
  return request.operation === 'sqrt'
    ? { ...saved, operation: 'sqrt' }
    : { ...saved, operation: request.operation, number2: request.number2 };
}
