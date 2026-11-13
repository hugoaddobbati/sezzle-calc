import { describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY, MAX_ENTRIES, addEntry, loadHistory, saveHistory, type HistoryEntry } from './history';

const entry = (n: number): HistoryEntry => ({
  number1: String(n),
  operation: 'add',
  number2: '1',
  result: String(n + 1),
  timestamp: n,
});

describe('addEntry', () => {
  it('puts the newest entry first', () => {
    expect(addEntry([entry(1)], entry(2))).toEqual([entry(2), entry(1)]);
  });

  it(`keeps at most ${MAX_ENTRIES} entries`, () => {
    let history: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) history = addEntry(history, entry(i));
    expect(history).toHaveLength(MAX_ENTRIES);
    expect(history[0]).toEqual(entry(24));
    expect(history.at(-1)).toEqual(entry(5));
  });
});

describe('saving and loading', () => {
  it('round-trips through localStorage', () => {
    saveHistory([entry(2), entry(1)]);
    expect(loadHistory()).toEqual([entry(2), entry(1)]);
  });

  it('keeps the rounded flag', () => {
    const rounded = {
      ...entry(1),
      operation: 'divide' as const,
      number2: '3',
      result: '0.3333333333',
      rounded: true,
    };
    saveHistory([rounded]);
    expect(loadHistory()).toEqual([rounded]);
  });

  it('returns an empty list when nothing is saved', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('ignores corrupt or unexpected data', () => {
    window.localStorage.setItem(HISTORY_KEY, '{not json');
    expect(loadHistory()).toEqual([]);

    window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ not: 'a list' }));
    expect(loadHistory()).toEqual([]);

    const sqrtEntry = { number1: '16', operation: 'sqrt', result: '4', timestamp: 3 };
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        entry(1),
        { number1: 1 },
        { ...entry(2), operation: 'modulo' },
        { ...entry(3), rounded: 'yes' },
        { number1: '1', operation: 'add', result: '2', timestamp: 4 }, // two-number operation without number2
        null,
        sqrtEntry,
      ]),
    );
    expect(loadHistory()).toEqual([entry(1), sqrtEntry]);
  });

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => saveHistory([entry(1)])).not.toThrow();
    expect(loadHistory()).toEqual([]);
  });
});
