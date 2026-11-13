package calculator

import "math/big"

// squareRoot computes √radicand rounded to DecimalPlaces, exactly, using
// whole-number arithmetic: floor(√x × 10^k) = isqrt(floor(x × 10^(2k))).
// This stays correct for 1000-digit inputs, where a fixed-precision float
// would not.
func squareRoot(radicand *big.Rat) (Result, error) {
	if radicand.Sign() < 0 {
		return Result{}, errNegativeSquareRoot()
	}

	// Keep one digit beyond DecimalPlaces to round on.
	const extraDigits = DecimalPlaces + 1
	scaled := new(big.Int).Mul(radicand.Num(), pow10(2*extraDigits))
	scaled.Quo(scaled, radicand.Denom())
	root := new(big.Int).Sqrt(scaled) // √radicand × 10^extraDigits, truncated

	// Round half up on the extra digit, matching big.Rat.FloatString.
	root.Add(root, big.NewInt(5))
	root.Quo(root, big.NewInt(10))
	rounded := new(big.Rat).SetFrac(root, pow10(DecimalPlaces))

	result := roundResult(rounded)
	// The rounded root is exact only if squaring it gives back the radicand.
	result.Rounded = new(big.Rat).Mul(rounded, rounded).Cmp(radicand) != 0
	return result, nil
}

func pow10(exponent int64) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(exponent), nil)
}
