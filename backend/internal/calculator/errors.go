package calculator

import "fmt"

// Code identifies a kind of calculation failure. Codes are part of the public
// API contract: the HTTP layer maps them to status codes and clients can rely
// on them to tell failures apart.
type Code string

const (
	CodeInvalidNumber      Code = "INVALID_NUMBER"
	CodeNumberTooLong      Code = "NUMBER_TOO_LONG"
	CodeUnknownOperation   Code = "UNKNOWN_OPERATION"
	CodeDivisionByZero     Code = "DIVISION_BY_ZERO"
	CodeNegativeSquareRoot Code = "NEGATIVE_SQUARE_ROOT"
	CodeNonIntegerExponent Code = "NON_INTEGER_EXPONENT"
	CodeResultTooLarge     Code = "RESULT_TOO_LARGE"
)

// Input field names, matching the JSON request fields.
const (
	FieldNumber1   = "number1"
	FieldNumber2   = "number2"
	FieldOperation = "operation"
)

// Error is returned for any calculation the calculator refuses to perform.
// Message is user-facing text; Field names the input at fault and is empty
// when no single input is to blame.
type Error struct {
	Code    Code
	Message string
	Field   string
}

func (e *Error) Error() string {
	return e.Message
}

// The constructors below hold every user-facing message, so the wording the
// API returns can be reviewed in one place. The frontend copies these
// messages word for word (see contract/calculations.json).

var fieldLabels = map[string]string{
	FieldNumber1: "First number",
	FieldNumber2: "Second number",
}

func errUnknownOperation() *Error {
	return &Error{
		Code:    CodeUnknownOperation,
		Message: fmt.Sprintf("Operation must be one of: %s.", operationList()),
		Field:   FieldOperation,
	}
}

func errNumberRequired(field string) *Error {
	return &Error{Code: CodeInvalidNumber, Message: fieldLabels[field] + " is required.", Field: field}
}

func errNumberFormat(field string) *Error {
	return &Error{
		Code:    CodeInvalidNumber,
		Message: fieldLabels[field] + " must be a plain decimal number, like 12 or -3.5.",
		Field:   field,
	}
}

func errNumberTooLong(field string) *Error {
	return &Error{
		Code:    CodeNumberTooLong,
		Message: fmt.Sprintf("%s can have at most %d digits.", fieldLabels[field], MaxDigits),
		Field:   field,
	}
}

func errDivisionByZero() *Error {
	return &Error{Code: CodeDivisionByZero, Message: "Division by zero is not permitted.", Field: FieldNumber2}
}

func errNegativeSquareRoot() *Error {
	return &Error{
		Code:    CodeNegativeSquareRoot,
		Message: "Cannot take the square root of a negative number.",
		Field:   FieldNumber1,
	}
}

func errNonIntegerExponent() *Error {
	return &Error{Code: CodeNonIntegerExponent, Message: "The exponent must be a whole number.", Field: FieldNumber2}
}

func errResultTooLarge() *Error {
	return &Error{
		Code:    CodeResultTooLarge,
		Message: fmt.Sprintf("The result would be too large (over %d digits).", MaxResultDigits),
	}
}
