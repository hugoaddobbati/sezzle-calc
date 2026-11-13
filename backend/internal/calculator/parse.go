package calculator

import (
	"math/big"
	"regexp"
	"strings"
)

// numberPattern accepts plain decimals only: an optional minus sign, digits,
// and optionally a decimal point followed by more digits. It rejects "+5",
// "1e5", ".5", "5.", "1,000", "1/2" and surrounding spaces.
var numberPattern = regexp.MustCompile(`^-?[0-9]+(\.[0-9]+)?$`)

// parseNumber checks one input against the input rules and converts it to an
// exact fraction. field names the input in any error.
func parseNumber(field, input string) (*big.Rat, error) {
	if input == "" {
		return nil, errNumberRequired(field)
	}
	if !numberPattern.MatchString(input) {
		return nil, errNumberFormat(field)
	}
	digits := len(input) - strings.Count(input, "-") - strings.Count(input, ".")
	if digits > MaxDigits {
		return nil, errNumberTooLong(field)
	}
	// The pattern above guarantees SetString succeeds.
	number, _ := new(big.Rat).SetString(input)
	return number, nil
}
