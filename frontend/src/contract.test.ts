import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { calculate } from './lib/api';
import type { Operation } from './lib/operations';
import { validate } from './lib/validation';

/*
 * contract/calculations.json is shared with the Go API tests, which send every
 * request and expect exactly these statuses and responses. Here we check the
 * frontend's side of the same contract.
 */

interface ContractCase {
  name: string;
  request: { number1: string; operation: string; number2?: string };
  status: number;
  response: Record<string, unknown>;
  /** Checked by the backend only (e.g. the power result-size estimate). */
  backendOnly?: boolean;
}

const contractFile = join(__dirname, '../../contract/calculations.json');
const { cases } = JSON.parse(readFileSync(contractFile, 'utf8')) as { cases: ContractCase[] };
const named = cases.map((c) => [c.name, c] as const);

describe('contract: frontend validation agrees with the backend', () => {
  it.each(named)('%s', (_name, c) => {
    const { number1, operation, number2 } = c.request;
    const error = validate(number1, operation as Operation, number2 ?? '');

    if (c.status === 200 || c.backendOnly) {
      expect(error).toBeNull();
    } else {
      expect(error).toEqual(c.response); // same code, message and field
    }
  });
});

describe('contract: the API client reads every response', () => {
  it.each(named)('%s', async (_name, c) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: c.status < 300, status: c.status, json: () => Promise.resolve(c.response) }),
    );
    const { number1, operation, number2 } = c.request;

    const outcome = await calculate(number1, operation as Operation, number2);

    expect(outcome).toEqual(
      c.status === 200 ? { ok: true, ...c.response } : { ok: false, error: c.response },
    );
  });
});

it('the contract file has cases', () => {
  expect(cases.length).toBeGreaterThan(0);
});
