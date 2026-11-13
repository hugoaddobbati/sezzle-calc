// Package calculator performs exact arithmetic on decimal strings.
//
// Numbers are parsed into math/big.Rat values (exact fractions), so results
// such as 0.1 + 0.2 are exactly 0.3 and very large values keep every digit.
// Every result is rounded to DecimalPlaces; Result.Rounded reports whether
// that rounding changed the exact answer (1/3, √2).
//
// The package knows nothing about HTTP or JSON; every rule about what makes a
// valid calculation lives here so it can be tested with plain function calls.
//
// Files: calculator.go (entry point), parse.go (input rules), power.go,
// sqrt.go, round.go (output rules), errors.go (codes and messages).
package calculator

import (
	"math/big"
	"strings"
)

const (
	// MaxDigits is the maximum number of digits allowed in one input
	// (the sign and decimal point are not counted).
	MaxDigits = 1000
	// MaxResultDigits caps the estimated size of a power result, so a
	// request like 9 ^ 999999999 is rejected before any work is done.
	MaxResultDigits = 10000
	// DecimalPlaces is how many decimals a result keeps.
	DecimalPlaces = 10
)

// Operation is one of the supported calculator operations.
type Operation string

const (
	Add      Operation = "add"
	Subtract Operation = "subtract"
	Multiply Operation = "multiply"
	Divide   Operation = "divide"
	Power    Operation = "power"
	Sqrt     Operation = "sqrt"
)

// Operations lists every supported operation, in display order.
var Operations = []Operation{Add, Subtract, Multiply, Divide, Power, Sqrt}

// Result is a successful calculation.
type Result struct {
	// Value is a plain decimal string with at most DecimalPlaces decimals.
	Value string
	// Rounded is true when the exact answer had more decimals than Value shows.
	Rounded bool
}

// Calculate applies operation to number1 and number2. For Sqrt, number2 is
// ignored. Any refusal is returned as an *Error carrying a Code.
func Calculate(number1, operation, number2 string) (Result, error) {
	op := Operation(operation)
	if !isSupported(op) {
		return Result{}, errUnknownOperation()
	}

	first, err := parseNumber(FieldNumber1, number1)
	if err != nil {
		return Result{}, err
	}
	if op == Sqrt {
		return squareRoot(first)
	}

	second, err := parseNumber(FieldNumber2, number2)
	if err != nil {
		return Result{}, err
	}

	switch op {
	case Add:
		return roundResult(new(big.Rat).Add(first, second)), nil
	case Subtract:
		return roundResult(new(big.Rat).Sub(first, second)), nil
	case Multiply:
		return roundResult(new(big.Rat).Mul(first, second)), nil
	case Divide:
		if second.Sign() == 0 {
			return Result{}, errDivisionByZero()
		}
		return roundResult(new(big.Rat).Quo(first, second)), nil
	default: // Power; isSupported guarantees no other case reaches here.
		return power(first, second)
	}
}

func isSupported(op Operation) bool {
	for _, supported := range Operations {
		if op == supported {
			return true
		}
	}
	return false
}

func operationList() string {
	names := make([]string, len(Operations))
	for i, op := range Operations {
		names[i] = string(op)
	}
	return strings.Join(names, ", ")
}
