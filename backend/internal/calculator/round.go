package calculator

import (
	"math/big"
	"strings"
)

// roundResult renders value as a plain decimal string rounded to
// DecimalPlaces (halves away from zero), with trailing zeros removed, and
// reports whether rounding changed the value.
func roundResult(value *big.Rat) Result {
	if value.IsInt() {
		return Result{Value: value.Num().String()}
	}
	text := value.FloatString(DecimalPlaces)
	shown, _ := new(big.Rat).SetString(text)
	rounded := shown.Cmp(value) != 0

	text = strings.TrimRight(text, "0")
	text = strings.TrimSuffix(text, ".")
	if text == "-0" {
		text = "0" // a tiny negative value that rounds to zero
	}
	return Result{Value: text, Rounded: rounded}
}

// digitCount returns how many decimal digits x has, ignoring its sign.
func digitCount(x *big.Int) int {
	return len(new(big.Int).Abs(x).String())
}
