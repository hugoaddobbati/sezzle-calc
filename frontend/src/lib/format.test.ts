import { describe, expect, it } from 'vitest';
import { describeLength, formatNumber } from './format';

describe('formatNumber', () => {
  it.each([
    ['0', '0'],
    ['12', '12'],
    ['123', '123'],
    ['1234', '1,234'],
    ['23570226.0699571569', '23,570,226.0699571569'],
    ['-1234567', '-1,234,567'],
    ['-0.5', '-0.5'],
    ['1000.', '1,000.'], // while typing a decimal point
    ['0.0001234', '0.0001234'], // decimals are never grouped
    ['', ''],
    ['-', '-'],
  ])('%s → %s', (input, output) => {
    expect(formatNumber(input)).toBe(output);
  });

  it('leaves anything that is not a plain decimal unchanged', () => {
    expect(formatNumber('Division by zero')).toBe('Division by zero');
    expect(formatNumber('1e5')).toBe('1e5');
  });

  it('handles very long numbers quickly', () => {
    const huge = '9'.repeat(10000);
    const start = performance.now();
    const formatted = formatNumber(huge);
    expect(performance.now() - start).toBeLessThan(50);
    expect(formatted).toHaveLength(10000 + 3333);
    expect(formatted.startsWith('9,999,')).toBe(true);
  });
});

describe('describeLength', () => {
  it('counts digits only', () => {
    expect(describeLength('-12.5')).toBe('3 digits');
    expect(describeLength('1'.repeat(3011))).toBe('3,011 digits');
  });
});
