package calculator

import (
	"errors"
	"math/big"
	"strings"
	"testing"
)

func TestCalculateSuccess(t *testing.T) {
	nines20 := strings.Repeat("9", 20)

	tests := []struct {
		name    string
		a, op   string
		b       string
		want    string
		rounded bool
	}{
		// Addition and subtraction
		{"add integers", "1", "add", "2", "3", false},
		{"add decimals exactly", "0.1", "add", "0.2", "0.3", false},
		{"add negatives", "-1.5", "add", "-2.25", "-3.75", false},
		{"negative zero normalised", "-0", "add", "0", "0", false},
		{"subtract to negative", "5", "subtract", "8", "-3", false},
		{"subtract decimals", "10.5", "subtract", "0.5", "10", false},
		{"exactly 10 decimals is not rounded", "0.1234567891", "add", "0", "0.1234567891", false},
		{"input beyond 10 decimals is rounded", "0.123456789012", "add", "0", "0.123456789", true},

		// Multiplication
		{"multiply", "-2.5", "multiply", "4", "-10", false},
		{"multiply beyond float64 precision", nines20, "multiply", nines20,
			strings.Repeat("9", 19) + "8" + strings.Repeat("0", 19) + "1", false},

		// Division
		{"divide exactly", "12", "divide", "4", "3", false},
		{"divide terminating", "1", "divide", "8", "0.125", false},
		{"divide rounds down", "1", "divide", "3", "0.3333333333", true},
		{"divide rounds up", "2", "divide", "3", "0.6666666667", true},
		{"divide negative", "-1", "divide", "3", "-0.3333333333", true},
		{"chained rounded value is used as-is", "0.3333333333", "multiply", "3", "0.9999999999", false},
		{"divide tiny rounds to zero", "1", "divide", "1" + strings.Repeat("0", 60), "0", true},
		{"divide tiny negative rounds to zero", "-1", "divide", "1" + strings.Repeat("0", 60), "0", true},

		// Power
		{"power", "2", "power", "10", "1024", false},
		{"power negative exponent", "2", "power", "-3", "0.125", false},
		{"power negative exponent rounded", "3", "power", "-1", "0.3333333333", true},
		{"power negative base odd", "-2", "power", "3", "-8", false},
		{"power negative base even", "-2", "power", "2", "4", false},
		{"power decimal base", "1.5", "power", "2", "2.25", false},
		{"power exponent written as decimal", "2", "power", "2.0", "4", false},
		{"power zero exponent", "5", "power", "0", "1", false},
		{"power zero to zero", "0", "power", "0", "1", false},
		{"power zero base", "0", "power", "5", "0", false},
		{"power one with huge exponent", "1", "power", "999999999999", "1", false},
		{"power minus one odd huge exponent", "-1", "power", "999999999999", "-1", false},
		{"power minus one even huge exponent", "-1", "power", "1000000000000", "1", false},
		{"power large", "10", "power", "100", "1" + strings.Repeat("0", 100), false},

		// Square root
		{"sqrt perfect square", "16", "sqrt", "", "4", false},
		{"sqrt decimal", "2.25", "sqrt", "", "1.5", false},
		{"sqrt rounds to 10 places", "2", "sqrt", "", "1.4142135624", true},
		{"sqrt zero", "0", "sqrt", "", "0", false},
		{"sqrt ignores number2", "9", "sqrt", "not a number", "3", false},
		{"sqrt of 999-digit number", "1" + strings.Repeat("0", 998), "sqrt", "", "1" + strings.Repeat("0", 499), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.a, tt.op, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %q, %q) returned error: %v", tt.a, tt.op, tt.b, err)
			}
			want := Result{Value: tt.want, Rounded: tt.rounded}
			if got != want {
				t.Errorf("Calculate(%q, %q, %q) = %+v, want %+v", tt.a, tt.op, tt.b, got, want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tooLong := strings.Repeat("9", MaxDigits+1)

	tests := []struct {
		name      string
		a, op, b  string
		wantCode  Code
		wantField string
	}{
		{"unknown operation", "1", "modulo", "2", CodeUnknownOperation, "operation"},
		{"missing operation", "1", "", "2", CodeUnknownOperation, "operation"},
		{"operation is case sensitive", "1", "ADD", "2", CodeUnknownOperation, "operation"},

		{"missing number1", "", "add", "2", CodeInvalidNumber, "number1"},
		{"missing number2", "1", "add", "", CodeInvalidNumber, "number2"},
		{"letters", "abc", "add", "2", CodeInvalidNumber, "number1"},
		{"scientific notation", "1e5", "add", "2", CodeInvalidNumber, "number1"},
		{"fraction syntax", "1/2", "add", "2", CodeInvalidNumber, "number1"},
		{"leading dot", ".5", "add", "2", CodeInvalidNumber, "number1"},
		{"trailing dot", "5.", "add", "2", CodeInvalidNumber, "number1"},
		{"plus sign", "+5", "add", "2", CodeInvalidNumber, "number1"},
		{"surrounding spaces", " 5", "add", "2", CodeInvalidNumber, "number1"},
		{"comma separator", "1,000", "add", "2", CodeInvalidNumber, "number1"},
		{"invalid number2", "1", "divide", "x", CodeInvalidNumber, "number2"},

		{"number1 too long", tooLong, "add", "1", CodeNumberTooLong, "number1"},
		{"number2 too long", "1", "add", tooLong, CodeNumberTooLong, "number2"},

		{"divide by zero", "5", "divide", "0", CodeDivisionByZero, "number2"},
		{"divide by zero written as decimal", "5", "divide", "0.000", CodeDivisionByZero, "number2"},
		{"zero to a negative power", "0", "power", "-1", CodeDivisionByZero, "number2"},

		{"sqrt of negative", "-4", "sqrt", "", CodeNegativeSquareRoot, "number1"},
		{"fractional exponent", "2", "power", "0.5", CodeNonIntegerExponent, "number2"},

		{"huge exponent", "9", "power", "999999999", CodeResultTooLarge, ""},
		{"exponent just over limit", "2", "power", "10001", CodeResultTooLarge, ""},
		{"multi-digit base over limit", "99", "power", "5001", CodeResultTooLarge, ""},
		{"huge negative exponent", "2", "power", "-999999999", CodeResultTooLarge, ""},
		{"decimal base over limit", "1.0000001", "power", "2000", CodeResultTooLarge, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.a, tt.op, tt.b)
			if err == nil {
				t.Fatalf("Calculate(%q, %q, %q) = %+v, want error %s", tt.a, tt.op, tt.b, got, tt.wantCode)
			}
			var calcErr *Error
			if !errors.As(err, &calcErr) {
				t.Fatalf("error is %T, want *calculator.Error", err)
			}
			if calcErr.Code != tt.wantCode {
				t.Errorf("code = %s, want %s", calcErr.Code, tt.wantCode)
			}
			if calcErr.Field != tt.wantField {
				t.Errorf("field = %q, want %q", calcErr.Field, tt.wantField)
			}
			if calcErr.Message == "" || calcErr.Error() != calcErr.Message {
				t.Errorf("message missing or Error() mismatch: %q", calcErr.Message)
			}
		})
	}
}

func TestDigitLimitBoundary(t *testing.T) {
	// Exactly MaxDigits digits is allowed; the sign and decimal point don't count.
	inputs := []string{
		strings.Repeat("9", MaxDigits),
		"-" + strings.Repeat("9", MaxDigits),
		"0." + strings.Repeat("9", MaxDigits-1),
	}
	for _, in := range inputs {
		if _, err := Calculate(in, "add", "1"); err != nil {
			t.Errorf("input of %d chars rejected: %v", len(in), err)
		}
	}
}

func TestPowerAtSizeLimit(t *testing.T) {
	// 2 ^ 10000 is exactly at the estimate limit and must be computed in full.
	got, err := Calculate("2", "power", "10000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Independent check: 2^10000 is 1 shifted left by 10000 bits.
	want := new(big.Int).Lsh(big.NewInt(1), 10000).String()
	if got.Value != want || got.Rounded {
		t.Errorf("2^10000 mismatch: got %d digits (rounded=%v), want %d", len(got.Value), got.Rounded, len(want))
	}
}
