import { useEffect, useReducer } from 'react';
import { runCalculation, toHistoryEntry } from '../lib/calculation';
import { formatNumber } from '../lib/format';
import type { HistoryEntry } from '../lib/history';
import {
  displayIsRounded,
  displayValue,
  expression,
  highlightedOperation,
  initialState,
  keyToAction,
  keypadReducer,
} from '../lib/keypad';
import { Display } from './Display';
import { Keypad } from './Keypad';

interface CalculatorProps {
  /** Called after each successful calculation. Must be stable (e.g. wrapped in useCallback). */
  onCalculated: (entry: HistoryEntry) => void;
}

/** Holds the keypad state and sends each calculation the keypad asks for. */
export function Calculator({ onCalculated }: CalculatorProps) {
  const [state, dispatch] = useReducer(keypadReducer, initialState);

  useEffect(() => {
    const request = state.request;
    if (!request) return;
    // Aborted when the request is replaced or cleared (C), so a late answer is never applied.
    const controller = new AbortController();

    void runCalculation(request, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return;
      if (!outcome.ok) {
        dispatch({ type: 'calculationFailed', message: outcome.error.message });
        return;
      }
      dispatch({ type: 'calculationSucceeded', result: outcome.result, rounded: outcome.rounded });
      onCalculated(toHistoryEntry(request, outcome.result, outcome.rounded));
    });

    return () => controller.abort();
  }, [state.request, onCalculated]);

  // Physical keyboard support.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = keyToAction(event.key);
      if (action) {
        event.preventDefault(); // e.g. stop "/" opening the browser's quick find
        dispatch(action);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section className="calculator" aria-label="Calculator">
      <Display
        expression={expression(state, formatNumber)}
        value={displayValue(state)}
        error={state.error}
        loading={state.request !== null}
        rounded={displayIsRounded(state)}
        isResult={state.showingResult}
      />
      <Keypad onPress={dispatch} activeOperation={highlightedOperation(state)} />
    </section>
  );
}
