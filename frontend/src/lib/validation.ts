import type { CalcError } from './api';
import type { Operation } from './operations';

/*
 * The frontend's copy of the backend's input rules
 * (backend/internal/calculator/calculator.go). Codes and messages match the
 * Go code word for word, so the user sees the same text whichever side
 * catches the problem. validation.test.ts uses the same cases as the Go tests.
 *
 * Not mirrored: the power result-size estimate. That check stays on the
 * backend only, which still answers with RESULT_TOO_LARGE.
 */

export const MAX_DIGITS = 1000;

const PLAIN_DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;
const ZERO = /^-?0+(\.0+)?$/;
const WHOLE_NUMBER = /^-?[0-9]+(\.0+)?$/;

const LABELS = { number1: 'First number', number2: 'Second number' } as const;

type Field = keyof typeof LABELS;

const DIVISION_BY_ZERO: CalcError = {
  code: 'DIVISION_BY_ZERO',
  message: 'Division by zero is not permitted.',
  field: 'number2',
};

/** Returns the first rule the inputs break, or null if they are valid. */
export function validate(number1: string, operation: Operation, number2: string): CalcError | null {
  const first = checkNumber('number1', number1);
  if (first) return first;

  if (operation === 'sqrt') {
    if (isNegative(number1)) {
      return {
        code: 'NEGATIVE_SQUARE_ROOT',
        message: 'Cannot take the square root of a negative number.',
        field: 'number1',
      };
    }
    return null; // number2 is ignored for square roots
  }

  const second = checkNumber('number2', number2);
  if (second) return second;

  if (operation === 'divide' && ZERO.test(number2)) {
    return DIVISION_BY_ZERO;
  }
  if (operation === 'power') {
    if (!WHOLE_NUMBER.test(number2)) {
      return {
        code: 'NON_INTEGER_EXPONENT',
        message: 'The exponent must be a whole number.',
        field: 'number2',
      };
    }
    if (ZERO.test(number1) && isNegative(number2)) {
      return DIVISION_BY_ZERO; // 0 ^ -n = 1 / 0 ^ n
    }
  }
  return null;
}

/** Counts digits only: the sign and decimal point don't count. */
export function digitCount(value: string): number {
  return value.replace(/[^0-9]/g, '').length;
}

function checkNumber(field: Field, value: string): CalcError | null {
  const label = LABELS[field];
  if (value === '') {
    return { code: 'INVALID_NUMBER', message: `${label} is required.`, field };
  }
  if (!PLAIN_DECIMAL.test(value)) {
    return {
      code: 'INVALID_NUMBER',
      message: `${label} must be a plain decimal number, like 12 or -3.5.`,
      field,
    };
  }
  if (digitCount(value) > MAX_DIGITS) {
    return {
      code: 'NUMBER_TOO_LONG',
      message: `${label} can have at most ${MAX_DIGITS} digits.`,
      field,
    };
  }
  return null;
}

function isNegative(value: string): boolean {
  return value.startsWith('-') && !ZERO.test(value);
}
