import { isOperation, type BinaryOperation } from './operations';

interface EntryBase {
  number1: string;
  result: string;
  /** True when the backend rounded the result to 10 decimal places. */
  rounded?: boolean;
  timestamp: number;
}

/**
 * One saved calculation: square root has one number, the rest two. Stored as
 * parts, so display changes apply to old entries too.
 */
export type HistoryEntry =
  (EntryBase & { operation: 'sqrt' }) | (EntryBase & { operation: BinaryOperation; number2: string });

export const HISTORY_KEY = 'calculator.history';
export const MAX_ENTRIES = 20;

/** Returns a new list with entry first, keeping at most MAX_ENTRIES. */
export function addEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, MAX_ENTRIES);
}

/**
 * Reads saved history. Returns an empty list if storage is blocked or holds
 * something unexpected: history is a convenience and must never break the app.
 */
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

/** Saves history; silently does nothing if storage is blocked or full. */
export function saveHistory(history: HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Private mode or blocked storage: keep working without persistence.
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.number1 === 'string' &&
    isOperation(e.operation) &&
    (e.operation === 'sqrt' || typeof e.number2 === 'string') &&
    typeof e.result === 'string' &&
    (e.rounded === undefined || typeof e.rounded === 'boolean') &&
    typeof e.timestamp === 'number'
  );
}
