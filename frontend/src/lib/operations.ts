/** Operations supported by the backend's POST /api/v1/calculate. */
export type Operation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt';

/** Operations that take two numbers. */
export type BinaryOperation = Exclude<Operation, 'sqrt'>;

/** How each operation is shown on screen. */
export const OPERATION_SYMBOLS: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  sqrt: '√',
};

/** Spoken names, for screen readers and button labels. */
export const OPERATION_NAMES: Record<Operation, string> = {
  add: 'Add',
  subtract: 'Subtract',
  multiply: 'Multiply',
  divide: 'Divide',
  power: 'Power',
  sqrt: 'Square root',
};

export function isOperation(value: unknown): value is Operation {
  return typeof value === 'string' && value in OPERATION_SYMBOLS;
}
