import { describe, expect, it } from 'vitest';
import type { Operation } from './operations';
import { MAX_DIGITS, digitCount, validate } from './validation';

// Every rule and message is checked against the backend in contract.test.ts,
// using the shared contract/calculations.json. These tests add the edge cases
// that only matter on the frontend side.

describe('validate', () => {
  it.each<[string, string, Operation, string]>([
    ['exactly 1000 digits', '9'.repeat(MAX_DIGITS), 'add', '1'],
    ['1000 digits with a sign', '-' + '9'.repeat(MAX_DIGITS), 'add', '1'],
    ['1000 digits with a decimal point', '0.' + '9'.repeat(MAX_DIGITS - 1), 'add', '1'],
    ['negative decimals', '-1.5', 'add', '-2.25'],
  ])('accepts %s', (_name, a, op, b) => {
    expect(validate(a, op, b)).toBeNull();
  });

  it('rejects fraction syntax', () => {
    expect(validate('1/2', 'add', '2')).toMatchObject({ code: 'INVALID_NUMBER', field: 'number1' });
  });
});

describe('digitCount', () => {
  it('counts digits only', () => {
    expect(digitCount('-12.50')).toBe(4);
    expect(digitCount('')).toBe(0);
  });
});
