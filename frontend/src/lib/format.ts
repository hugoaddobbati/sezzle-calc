import { digitCount } from './validation';

/*
 * Display-only formatting. Numbers are stored and sent to the API as plain
 * strings ("23570226.0699571569"); only what the user sees gets separators.
 */

/**
 * Adds comma separators to the whole-number part: "23570226.0699571569" →
 * "23,570,226.0699571569". Decimals are left ungrouped. Works on strings of
 * any length (no JavaScript number conversion), and returns anything that
 * isn't a plain decimal unchanged.
 */
export function formatNumber(value: string): string {
  const match = /^(-?)([0-9]*)(\.[0-9]*)?$/.exec(value);
  if (!match) return value;
  const [, sign, whole, decimals = ''] = match;
  return sign + groupThousands(whole) + decimals;
}

/** "3011" → "3,011 digits", for the note under very long results. */
export function describeLength(value: string): string {
  return `${formatNumber(String(digitCount(value)))} digits`;
}

function groupThousands(digits: string): string {
  // Built in chunks rather than with a look-ahead regex, which gets slow
  // on the thousands-of-digit results this calculator can produce.
  const firstGroup = digits.length % 3 || 3;
  const groups = [digits.slice(0, firstGroup)];
  for (let i = firstGroup; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join(',');
}
