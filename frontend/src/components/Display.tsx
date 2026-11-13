import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { describeLength, formatNumber } from '../lib/format';
import { digitCount } from '../lib/validation';

/** Results longer than this get a "N digits" note. */
export const LONG_RESULT_DIGITS = 20;

interface DisplayProps {
  expression: string;
  value: string;
  error: string | null;
  loading: boolean;
  rounded: boolean;
  /** The value is a calculated result rather than a number being typed. */
  isResult: boolean;
}

export function Display({ expression, value, error, loading, rounded, isResult }: DisplayProps) {
  const valueRef = useRef<HTMLOutputElement>(null);
  const shown = error ?? formatNumber(value);

  // One line only: if the number still doesn't fit at the smallest size,
  // show the start of a result, or the end of a number being typed.
  useLayoutEffect(() => {
    const el = valueRef.current;
    if (el) el.scrollLeft = isResult ? 0 : el.scrollWidth;
  }, [shown, isResult]);

  const notes = [
    rounded && 'Rounded to 10 decimal places',
    !error && isResult && digitCount(value) > LONG_RESULT_DIGITS && describeLength(value),
  ].filter(Boolean);

  // --chars lets CSS pick a font size that fits the number on one line.
  const style = { '--chars': shown.length } as CSSProperties;

  return (
    <div className="display" aria-busy={loading}>
      <div className="display__expression" data-testid="expression">
        {expression}
      </div>
      {/*
        The <output> stays mounted so screen readers announce each change;
        only the inner text is re-keyed, which replays the fade-in.
      */}
      <output
        ref={valueRef}
        style={style}
        className={`display__value${error ? ' display__value--error' : ''}${loading ? ' display__value--loading' : ''}`}
        aria-live="polite"
        data-testid="display"
        role={error ? 'alert' : undefined}
      >
        <span key={shown} className="display__text">
          {shown}
        </span>
      </output>
      {notes.length > 0 && <div className="display__note">{notes.join(' · ')}</div>}
    </div>
  );
}
