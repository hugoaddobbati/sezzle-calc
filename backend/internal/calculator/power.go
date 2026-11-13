package calculator

import "math/big"

// power raises base to a whole-number exponent (negative exponents allowed).
func power(base, exponent *big.Rat) (Result, error) {
	if !exponent.IsInt() {
		return Result{}, errNonIntegerExponent()
	}
	n := exponent.Num()
	absN := new(big.Int).Abs(n)

	// Bases whose powers never grow are answered directly, so 1 ^ 999999
	// is not rejected by the size estimate below.
	switch {
	case n.Sign() == 0:
		return Result{Value: "1"}, nil // includes 0 ^ 0, by the usual convention
	case base.Sign() == 0:
		if n.Sign() < 0 {
			return Result{}, errDivisionByZero() // 0 ^ -n = 1 / 0 ^ n
		}
		return Result{Value: "0"}, nil
	case isPlusOrMinusOne(base):
		if base.Sign() < 0 && absN.Bit(0) == 1 {
			return Result{Value: "-1"}, nil // odd power of -1
		}
		return Result{Value: "1"}, nil
	}

	if powerTooLarge(base, absN) {
		return Result{}, errResultTooLarge()
	}

	// base = p/q, so base ^ n = p^n / q^n, inverted for negative n.
	numerator := new(big.Int).Exp(base.Num(), absN, nil)
	denominator := new(big.Int).Exp(base.Denom(), absN, nil)
	result := new(big.Rat).SetFrac(numerator, denominator)
	if n.Sign() < 0 {
		result.Inv(result) // base is non-zero here
	}
	return roundResult(result), nil
}

// powerTooLarge estimates the size of base ^ absExponent before computing it.
// The numerator and denominator each grow to about
// (their digit count × exponent) digits.
func powerTooLarge(base *big.Rat, absExponent *big.Int) bool {
	// Every base has at least one digit, so this check alone is enough for
	// big exponents, and it keeps the multiplication below from overflowing.
	if absExponent.Cmp(big.NewInt(MaxResultDigits)) > 0 {
		return true
	}
	baseDigits := max(digitCount(base.Num()), digitCount(base.Denom()))
	return absExponent.Int64()*int64(baseDigits) > MaxResultDigits
}

func isPlusOrMinusOne(x *big.Rat) bool {
	return x.IsInt() && new(big.Int).Abs(x.Num()).Cmp(big.NewInt(1)) == 0
}
