import type { KeypadAction } from '../lib/keypad';
import { OPERATION_NAMES, OPERATION_SYMBOLS, type BinaryOperation } from '../lib/operations';

interface Key {
  label: string;
  name: string;
  action: KeypadAction;
  kind: 'digit' | 'operator' | 'function' | 'equals';
  /** Set on operator keys, to highlight the chosen one. */
  operation?: BinaryOperation;
}

const digit = (d: string): Key => ({ label: d, name: d, action: { type: 'digit', digit: d }, kind: 'digit' });

const operator = (operation: BinaryOperation): Key => ({
  label: OPERATION_SYMBOLS[operation],
  name: OPERATION_NAMES[operation],
  action: { type: 'operator', operation },
  kind: 'operator',
  operation,
});

// Laid out row by row on a four-column grid; "=" spans the last row.
// prettier-ignore
const KEYS: Key[] = [
  { label: 'C', name: 'Clear', action: { type: 'clear' }, kind: 'function' },
  { label: '⌫', name: 'Backspace', action: { type: 'backspace' }, kind: 'function' },
  { label: '√', name: OPERATION_NAMES.sqrt, action: { type: 'sqrt' }, kind: 'function' },
  operator('power'),
  digit('7'), digit('8'), digit('9'), operator('divide'),
  digit('4'), digit('5'), digit('6'), operator('multiply'),
  digit('1'), digit('2'), digit('3'), operator('subtract'),
  { label: '±', name: 'Toggle sign', action: { type: 'toggleSign' }, kind: 'function' },
  digit('0'),
  { label: '.', name: 'Decimal point', action: { type: 'decimal' }, kind: 'digit' },
  operator('add'),
  { label: '=', name: 'Equals', action: { type: 'equals' }, kind: 'equals' },
];

interface KeypadProps {
  onPress: (action: KeypadAction) => void;
  activeOperation: BinaryOperation | null;
}

export function Keypad({ onPress, activeOperation }: KeypadProps) {
  return (
    <div className="keypad">
      {KEYS.map((key) => (
        <button
          key={key.name}
          type="button"
          className={`key key--${key.kind}`}
          aria-label={key.name}
          aria-pressed={key.operation ? key.operation === activeOperation : undefined}
          onClick={() => onPress(key.action)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
