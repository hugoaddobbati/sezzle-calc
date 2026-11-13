import { OPERATION_SYMBOLS, type BinaryOperation } from './operations';
import { MAX_DIGITS, digitCount } from './validation';

/*
 * The keypad's rules as a reducer: a pure function (state, action) → new state.
 * It never calls the backend itself. When a key press needs a calculation it
 * sets `request`; the Calculator component sends it and reports back with
 * calculationSucceeded / calculationFailed.
 */

/** One of the two numbers the keypad builds. */
export type Entry = 'number1' | 'number2';

/** A calculation waiting to be sent: square root takes one number, the rest two. */
export type CalculationRequest =
  | {
      operation: 'sqrt';
      number1: string;
      /** Which entry the result replaces. */
      replaces: Entry;
    }
  | {
      operation: BinaryOperation;
      number1: string;
      number2: string;
      /** Operator pressed to chain the next calculation (2 + 3 +), if any. */
      chainedOperation: BinaryOperation | null;
    };

export interface KeypadState {
  /** First number; never empty ('0' before anything is typed). */
  number1: string;
  operation: BinaryOperation | null;
  /** Second number; '' until the user starts typing it. */
  number2: string;
  /** The number on screen is a result: the next digit replaces it instead of extending it. */
  showingResult: boolean;
  /** Which entry, if any, holds a result the backend rounded. */
  roundedEntry: Entry | null;
  /** Message shown instead of the number; the next key press starts over. */
  error: string | null;
  /** Calculation waiting for the backend; input is ignored meanwhile. */
  request: CalculationRequest | null;
}

export type KeypadAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'equals' }
  | { type: 'sqrt' }
  | { type: 'calculationSucceeded'; result: string; rounded: boolean }
  | { type: 'calculationFailed'; message: string };

/** Actions that come from the user pressing a key. */
type InputAction = Exclude<KeypadAction, { type: 'clear' | 'calculationSucceeded' | 'calculationFailed' }>;

export const initialState: KeypadState = {
  number1: '0',
  operation: null,
  number2: '',
  showingResult: true,
  roundedEntry: null,
  error: null,
  request: null,
};

export function keypadReducer(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case 'clear':
      return initialState;
    case 'calculationSucceeded':
      return applyResult(state, action.result, action.rounded);
    case 'calculationFailed':
      return state.request ? { ...state, request: null, error: action.message } : state;
  }

  if (state.request) return state; // waiting for the backend: ignore input
  // After an error, the next key press starts from a clean keypad.
  return handleInput(state.error ? initialState : state, action);
}

/** The entry shown on the display: the second number once typing it has started. */
export function shownEntry(state: KeypadState): Entry {
  return state.operation !== null && state.number2 !== '' ? 'number2' : 'number1';
}

/** The big number on the display. */
export function displayValue(state: KeypadState): string {
  return state[shownEntry(state)];
}

/** True when the number on the display is a result the backend rounded. */
export function displayIsRounded(state: KeypadState): boolean {
  return state.error === null && state.roundedEntry === shownEntry(state);
}

/** The operator button to highlight: the chosen one, until the second number is typed. */
export function highlightedOperation(state: KeypadState): BinaryOperation | null {
  return state.number2 === '' ? state.operation : null;
}

/** The small line above the number, e.g. "12 ÷". `format` styles the number for display. */
export function expression(state: KeypadState, format: (n: string) => string = (n) => n): string {
  return state.operation === null ? '' : `${format(state.number1)} ${OPERATION_SYMBOLS[state.operation]}`;
}

/** Turns an entry into the API's plain-decimal format ("5." → "5"). */
export function normalize(value: string): string {
  const trimmed = value.endsWith('.') ? value.slice(0, -1) : value;
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/** Maps a physical keyboard key to a keypad action, or null if unused. */
export function keyToAction(key: string): KeypadAction | null {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key };
  switch (key) {
    case '.':
    case ',':
      return { type: 'decimal' };
    case '+':
      return { type: 'operator', operation: 'add' };
    case '-':
      return { type: 'operator', operation: 'subtract' };
    case '*':
    case 'x':
      return { type: 'operator', operation: 'multiply' };
    case '/':
      return { type: 'operator', operation: 'divide' };
    case '^':
      return { type: 'operator', operation: 'power' };
    case 'r':
      return { type: 'sqrt' };
    case 'Enter':
    case '=':
      return { type: 'equals' };
    case 'Backspace':
      return { type: 'backspace' };
    case 'Escape':
    case 'Delete':
      return { type: 'clear' };
    default:
      return null;
  }
}

function handleInput(state: KeypadState, action: InputAction): KeypadState {
  switch (action.type) {
    case 'digit':
      return setEditedEntry(state, appendDigit(typedSoFar(state), action.digit));
    case 'decimal': {
      const current = typedSoFar(state);
      if (current.includes('.')) return state;
      // "." on an empty or sign-only number starts it at 0: "" → "0.", "-" → "-0."
      const start = current === '' || current === '-' ? `${current}0` : current;
      return setEditedEntry(state, `${start}.`);
    }
    case 'toggleSign': {
      const current = state[editedEntry(state)];
      // An empty second number starts negative: 5 × ± 3 → 5 × -3.
      if (current === '') return setEditedEntry(state, '-');
      const flipped = current.startsWith('-') ? current.slice(1) : `-${current}`;
      return setEditedEntry(state, flipped, { keepRounded: true }); // still the same rounded result
    }
    case 'backspace':
      return backspace(state);
    case 'operator':
      return pressOperator(state, action.operation);
    case 'equals':
      if (state.operation === null || !hasDigits(state.number2)) return state;
      return { ...state, request: binaryRequest(state, state.operation, null) };
    case 'sqrt': {
      // Applies to the number on screen; a lone "-" isn't a number yet.
      const replaces = shownEntry(state);
      if (!hasDigits(state[replaces])) return state;
      return { ...state, request: { operation: 'sqrt', number1: normalize(state[replaces]), replaces } };
    }
  }
}

/** The entry the next digit goes into. */
function editedEntry(state: KeypadState): Entry {
  return state.operation === null ? 'number1' : 'number2';
}

/** What typing extends: nothing if a result is showing, since a digit replaces it. */
function typedSoFar(state: KeypadState): string {
  return state.showingResult ? '' : state[editedEntry(state)];
}

function setEditedEntry(
  state: KeypadState,
  value: string,
  { keepRounded = false }: { keepRounded?: boolean } = {},
): KeypadState {
  const entry = editedEntry(state);
  // Editing a rounded result turns it into a number the user typed.
  const roundedEntry = state.roundedEntry === entry && !keepRounded ? null : state.roundedEntry;
  return { ...state, [entry]: value, showingResult: false, roundedEntry };
}

function appendDigit(current: string, digit: string): string {
  if (current === '' || current === '0') return digit;
  if (current === '-0') return `-${digit}`;
  if (digitCount(current) >= MAX_DIGITS) return current;
  return current + digit;
}

function pressOperator(state: KeypadState, operation: BinaryOperation): KeypadState {
  if (state.operation !== null) {
    if (hasDigits(state.number2)) {
      // 2 + 3 + → calculate 2 + 3 first, then continue with "5 +".
      return { ...state, request: binaryRequest(state, state.operation, operation) };
    }
    if (state.number2 === '' && operation === 'subtract') {
      // Minus straight after another operator starts a negative number: 5 × − 3 → 5 × -3.
      return setEditedEntry(state, '-');
    }
  }
  // Starts an operation, or replaces one chosen a moment ago (2 + × → 2 ×),
  // dropping a lone "-" typed for the second number.
  return { ...state, number1: normalize(state.number1), operation, number2: '', showingResult: false };
}

/** True once a number has at least one digit (so "" and a lone "-" don't count). */
function hasDigits(value: string): boolean {
  return /[0-9]/.test(value);
}

function backspace(state: KeypadState): KeypadState {
  if (state.operation !== null && state.number2 === '') {
    return { ...state, operation: null, showingResult: false }; // undo the operator
  }
  if (state.showingResult) return state; // results aren't edited digit by digit

  const entry = editedEntry(state);
  const shortened = state[entry].slice(0, -1);
  if (shortened !== '' && shortened !== '-') return setEditedEntry(state, shortened);
  // Emptied: the first number falls back to '0'; the second goes back to "not typed yet".
  return setEditedEntry(state, entry === 'number1' ? '0' : '');
}

function binaryRequest(
  state: KeypadState,
  operation: BinaryOperation,
  chainedOperation: BinaryOperation | null,
): CalculationRequest {
  return {
    operation,
    number1: normalize(state.number1),
    number2: normalize(state.number2),
    chainedOperation,
  };
}

function applyResult(state: KeypadState, result: string, rounded: boolean): KeypadState {
  const request = state.request;
  if (!request) return state; // cleared while waiting: ignore the late answer

  if (request.operation === 'sqrt' && request.replaces === 'number2') {
    return {
      ...state,
      number2: result,
      showingResult: true,
      roundedEntry: rounded ? 'number2' : withoutMark(state.roundedEntry, 'number2'),
      request: null,
    };
  }

  // √ of the first number keeps any chosen operator;
  // a two-number result continues with the chained operator, if there was one.
  const operation = request.operation === 'sqrt' ? state.operation : request.chainedOperation;
  return {
    ...state,
    number1: result,
    operation,
    number2: '',
    showingResult: operation === null,
    roundedEntry: rounded ? 'number1' : null,
    request: null,
  };
}

/** Removes the rounded mark from `entry`, keeping a mark on the other entry. */
function withoutMark(roundedEntry: Entry | null, entry: Entry): Entry | null {
  return roundedEntry === entry ? null : roundedEntry;
}
