import { formatNumber } from '../lib/format';
import type { HistoryEntry } from '../lib/history';
import { OPERATION_SYMBOLS } from '../lib/operations';

/** "12 ÷ 4 = 3", "√16 = 4", or "1 ÷ 3 ≈ 0.3333333333" when rounded. */
export function formatEntry(entry: HistoryEntry): string {
  const symbol = OPERATION_SYMBOLS[entry.operation];
  const n1 = formatNumber(entry.number1);
  const left =
    entry.operation === 'sqrt' ? `${symbol}${n1}` : `${n1} ${symbol} ${formatNumber(entry.number2)}`;
  return `${left} ${entry.rounded ? '≈' : '='} ${formatNumber(entry.result)}`;
}

interface HistoryListProps {
  entries: HistoryEntry[];
}

export function HistoryList({ entries }: HistoryListProps) {
  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="history__title">
        Recent calculations
      </h2>
      {entries.length === 0 ? (
        <p className="history__empty">No calculations yet.</p>
      ) : (
        <ol className="history__list">
          {entries.map((entry) => (
            <li key={`${entry.timestamp}-${formatEntry(entry)}`} className="history__item">
              {/* One line, cut with "…"; hovering shows the full calculation. */}
              <span className="history__calc" title={formatEntry(entry)}>
                {formatEntry(entry)}
              </span>
              <time className="history__time" dateTime={new Date(entry.timestamp).toISOString()}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
