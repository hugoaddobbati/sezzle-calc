import { describe, expect, it } from 'vitest';
import {
  displayIsRounded,
  displayValue,
  expression,
  initialState,
  keyToAction,
  keypadReducer,
  normalize,
  type KeypadAction,
  type KeypadState,
} from './keypad';

/** Presses a sequence of keys written like "12/4=" (r = √, ± = sign, < = backspace). */
function press(keys: string, from: KeypadState = initialState): KeypadState {
  let state = from;
  for (const key of keys) {
    const action: KeypadAction | null =
      key === '±' ? { type: 'toggleSign' } : key === '<' ? { type: 'backspace' } : keyToAction(key);
    if (!action) throw new Error(`no action for key ${key}`);
    state = keypadReducer(state, action);
  }
  return state;
}

const succeed = (state: KeypadState, result: string, rounded = false) =>
  keypadReducer(state, { type: 'calculationSucceeded', result, rounded });

const fail = (state: KeypadState, message: string) =>
  keypadReducer(state, { type: 'calculationFailed', message });

describe('typing numbers', () => {
  it('starts at 0 and replaces it with the first digit', () => {
    expect(displayValue(initialState)).toBe('0');
    expect(displayValue(press('7'))).toBe('7');
    expect(displayValue(press('007'))).toBe('7');
  });

  it('builds decimals and allows only one point', () => {
    expect(displayValue(press('.5'))).toBe('0.5');
    expect(displayValue(press('1.2.3'))).toBe('1.23');
  });

  it('toggles the sign', () => {
    expect(displayValue(press('5±'))).toBe('-5');
    expect(displayValue(press('5±±'))).toBe('5');
    expect(displayValue(press('±3'))).toBe('-3');
  });

  it('starts a negative second number with ± before typing it', () => {
    const state = press('5*±');
    expect(displayValue(state)).toBe('-');
    expect(press('3=', state).request).toMatchObject({ operation: 'multiply', number1: '5', number2: '-3' });
    expect(press('5*±±').number2).toBe(''); // pressing ± again takes the sign back off
  });

  it('backspacing a negative second number empties it', () => {
    expect(press('5+3±<').number2).toBe('');
  });

  it('backspaces digits, then falls back to 0', () => {
    expect(displayValue(press('123<'))).toBe('12');
    expect(displayValue(press('1<'))).toBe('0');
    expect(displayValue(press('5±<'))).toBe('0');
  });

  it('stops accepting digits at the 1000-digit limit', () => {
    const state = press('9'.repeat(1005));
    expect(displayValue(state)).toHaveLength(1000);
  });
});

describe('operations', () => {
  it('shows the expression and the second number', () => {
    const state = press('12/4');
    expect(expression(state)).toBe('12 ÷');
    expect(displayValue(state)).toBe('4');
  });

  it('requests the calculation on equals', () => {
    const state = press('12/4=');
    expect(state.request).toEqual({
      operation: 'divide',
      number1: '12',
      number2: '4',
      chainedOperation: null,
    });
  });

  it('shows the result and starts fresh on the next digit', () => {
    const done = succeed(press('12/4='), '3');
    expect(displayValue(done)).toBe('3');
    expect(expression(done)).toBe('');
    expect(done.request).toBeNull();
    expect(displayValue(press('7', done))).toBe('7');
  });

  it('continues from a result with an operator', () => {
    const state = press('*2', succeed(press('12/4='), '3'));
    expect(expression(state)).toBe('3 ×');
    expect(state.request).toBeNull();
    expect(press('=', state).request).toMatchObject({ number1: '3', operation: 'multiply', number2: '2' });
  });

  it('chains: 2 + 3 + calculates 2 + 3 and continues with 5 +', () => {
    const state = press('2+3+');
    expect(state.request).toMatchObject({
      number1: '2',
      operation: 'add',
      number2: '3',
      chainedOperation: 'add',
    });
    const after = succeed(state, '5');
    expect(expression(after)).toBe('5 +');
    expect(after.number2).toBe('');
  });

  it('replaces an operator pressed straight after another', () => {
    expect(expression(press('2+*'))).toBe('2 ×');
  });

  it('ignores equals without a second number', () => {
    expect(press('2+=').request).toBeNull();
    expect(press('2=').request).toBeNull();
  });

  it('backspace on an empty second number removes the operator', () => {
    expect(expression(press('2+<'))).toBe('');
    expect(displayValue(press('2+<'))).toBe('2');
  });

  it('cleans up entries before sending ("5." becomes "5")', () => {
    expect(press('5.+2=').request).toMatchObject({ number1: '5', number2: '2' });
    expect(press('2+5.=').request).toMatchObject({ number2: '5' });
  });

  it('does not edit a result digit by digit', () => {
    const done = succeed(press('1+1='), '2');
    expect(displayValue(press('<', done))).toBe('2');
  });
});

describe('negative numbers', () => {
  it('starts a negative second number with − straight after another operator', () => {
    const state = press('5*-3');
    expect(expression(state)).toBe('5 ×');
    expect(displayValue(state)).toBe('-3');
    expect(press('=', state).request).toMatchObject({ operation: 'multiply', number1: '5', number2: '-3' });
  });

  it('works for every operator', () => {
    expect(press('8/-2=').request).toMatchObject({ operation: 'divide', number2: '-2' });
    expect(press('2^-3=').request).toMatchObject({ operation: 'power', number2: '-3' });
    expect(press('1+-4=').request).toMatchObject({ operation: 'add', number2: '-4' });
    expect(press('1--4=').request).toMatchObject({ operation: 'subtract', number2: '-4' });
  });

  it('a negative first number works with ±', () => {
    expect(press('±5*3=').request).toMatchObject({ number1: '-5', number2: '3' });
    expect(press('5±*3=').request).toMatchObject({ number1: '-5', number2: '3' });
  });

  it('builds negative decimals from a lone minus', () => {
    expect(displayValue(press('5*-.5'))).toBe('-0.5');
    expect(displayValue(press('5*-0.5'))).toBe('-0.5');
  });

  it('waits for a digit before = or √ will use a lone minus', () => {
    expect(press('5*-=').request).toBeNull();
    expect(press('5*-r').request).toBeNull();
  });

  it('backspace removes a lone minus, then the operator', () => {
    const state = press('5*-<');
    expect(state.number2).toBe('');
    expect(expression(state)).toBe('5 ×');
    expect(expression(press('<', state))).toBe('');
  });

  it('another operator after a lone minus replaces the operator and drops the minus', () => {
    const state = press('5*-+');
    expect(expression(state)).toBe('5 +');
    expect(state.number2).toBe('');
  });

  it('other operators still replace a mis-tapped one', () => {
    expect(expression(press('2+*'))).toBe('2 ×');
  });
});

describe('square root', () => {
  it('applies immediately to the first number', () => {
    const state = press('16r');
    expect(state.request).toEqual({ operation: 'sqrt', number1: '16', replaces: 'number1' });
    expect(displayValue(succeed(state, '4'))).toBe('4');
  });

  it('applies to the second number while it is being typed', () => {
    const state = press('9+16r');
    expect(state.request).toMatchObject({ number1: '16', operation: 'sqrt', replaces: 'number2' });
    const after = succeed(state, '4');
    expect(expression(after)).toBe('9 +');
    expect(displayValue(after)).toBe('4');
    // The root is a result: a new digit replaces it.
    expect(displayValue(press('5', after))).toBe('5');
  });

  it('keeps a chosen operator when applied to the first number', () => {
    const after = succeed(press('9+r'), '3');
    expect(expression(after)).toBe('3 +');
  });
});

describe('rounded results', () => {
  const third = () => succeed(press('1/3='), '0.3333333333', true);

  it('marks a rounded result', () => {
    expect(displayIsRounded(third())).toBe(true);
    expect(displayIsRounded(succeed(press('12/4='), '3'))).toBe(false);
  });

  it('chains on the rounded value: 1 ÷ 3 × 3 sends 0.3333333333 × 3', () => {
    const state = press('*3=', third());
    expect(state.request).toMatchObject({ number1: '0.3333333333', operation: 'multiply', number2: '3' });
    expect(displayIsRounded(succeed(state, '0.9999999999'))).toBe(false);
  });

  it('keeps the mark while the rounded number is still shown', () => {
    expect(displayIsRounded(press('*', third()))).toBe(true); // "0.3333333333 ×", number shown
    expect(displayIsRounded(press('±', third()))).toBe(true); // sign flip doesn't change rounding
  });

  it('drops the mark once another number is shown or typed', () => {
    expect(displayIsRounded(press('*3', third()))).toBe(false); // second number on screen
    expect(displayIsRounded(press('7', third()))).toBe(false); // replaced by a typed number
    expect(displayIsRounded(press('*3<<', third()))).toBe(true); // second number erased: the result is shown again
  });

  it('marks a rounded square root of the second number', () => {
    const state = succeed(press('1+2r'), '1.4142135624', true);
    expect(displayValue(state)).toBe('1.4142135624');
    expect(displayIsRounded(state)).toBe(true);
    expect(displayIsRounded(succeed(press('1+4r'), '2'))).toBe(false);
  });

  it('drops the mark when an exact square root replaces a rounded second number', () => {
    const rounded = succeed(press('1+2r'), '1.4142135624', true);
    const exact = succeed(press('r', rounded), '1.189207115', false);
    expect(exact.roundedEntry).toBeNull();
    expect(displayIsRounded(exact)).toBe(false);
  });

  it('keeps a rounded first number marked when the second gets an exact square root', () => {
    const state = succeed(press('*4r', third()), '2', false);
    expect(state.roundedEntry).toBe('number1');
    expect(displayIsRounded(state)).toBe(false); // the second number is on screen
  });

  it('clears the mark on errors', () => {
    const failed = fail(press('/0=', third()), 'Division by zero is not permitted.');
    expect(displayIsRounded(failed)).toBe(false);
  });
});

describe('waiting and errors', () => {
  it('ignores input while waiting for the backend', () => {
    const waiting = press('1+1=');
    expect(press('5', waiting)).toBe(waiting);
  });

  it('shows an error and starts over on the next key', () => {
    const failed = fail(press('5/0='), 'Division by zero is not permitted.');
    expect(failed.error).toBe('Division by zero is not permitted.');
    expect(failed.request).toBeNull();
    const next = press('7', failed);
    expect(next.error).toBeNull();
    expect(displayValue(next)).toBe('7');
    expect(expression(next)).toBe('');
  });

  it('clear cancels a pending calculation and late answers are ignored', () => {
    const cleared = keypadReducer(press('1+1='), { type: 'clear' });
    expect(cleared).toEqual(initialState);
    expect(succeed(cleared, '2')).toEqual(initialState);
    expect(fail(cleared, 'late')).toEqual(initialState);
  });
});

describe('keyToAction', () => {
  it.each([
    ['5', { type: 'digit', digit: '5' }],
    [',', { type: 'decimal' }],
    ['-', { type: 'operator', operation: 'subtract' }],
    ['x', { type: 'operator', operation: 'multiply' }],
    ['^', { type: 'operator', operation: 'power' }],
    ['Enter', { type: 'equals' }],
    ['Escape', { type: 'clear' }],
    ['Delete', { type: 'clear' }],
    ['Backspace', { type: 'backspace' }],
  ])('%s', (key, action) => {
    expect(keyToAction(key)).toEqual(action);
  });

  it('ignores other keys', () => {
    expect(keyToAction('a')).toBeNull();
    expect(keyToAction('Shift')).toBeNull();
  });
});

describe('normalize', () => {
  it.each([
    ['5.', '5'],
    ['', '0'],
    ['-', '0'],
    ['-2.5', '-2.5'],
  ])('%s → %s', (input, output) => {
    expect(normalize(input)).toBe(output);
  });
});
