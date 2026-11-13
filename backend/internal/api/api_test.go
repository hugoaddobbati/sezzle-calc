package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"calculator/internal/calculator"
)

var quietLogger = slog.New(slog.NewTextHandler(io.Discard, nil))

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	NewRouter(quietLogger).ServeHTTP(rec, req)
	return rec
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not a JSON object of strings: %v (%q)", err, rec.Body.String())
	}
	return body
}

// decodeSuccess reads a 200 body of the shape {"result": string, "rounded": bool}.
func decodeSuccess(t *testing.T, rec *httptest.ResponseRecorder) (string, bool) {
	t.Helper()
	var body struct {
		Result  *string `json:"result"`
		Rounded *bool   `json:"rounded"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Result == nil || body.Rounded == nil {
		t.Fatalf("success body missing result or rounded: %q", rec.Body.String())
	}
	return *body.Result, *body.Rounded
}

func TestCalculateSuccess(t *testing.T) {
	rec := do(t, http.MethodPost, "/api/v1/calculate",
		`{"number1": "12", "operation": "divide", "number2": "4"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if result, rounded := decodeSuccess(t, rec); result != "3" || rounded {
		t.Errorf("got result=%q rounded=%v, want 3 false", result, rounded)
	}
}

func TestCalculateRounded(t *testing.T) {
	rec := do(t, http.MethodPost, "/api/v1/calculate",
		`{"number1": "1", "operation": "divide", "number2": "3"}`)
	if result, rounded := decodeSuccess(t, rec); result != "0.3333333333" || !rounded {
		t.Errorf("got result=%q rounded=%v, want 0.3333333333 true", result, rounded)
	}
}

func TestCalculateSqrtWithoutNumber2(t *testing.T) {
	rec := do(t, http.MethodPost, "/api/v1/calculate", `{"number1": "16", "operation": "sqrt"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if result, _ := decodeSuccess(t, rec); result != "4" {
		t.Errorf("result = %q, want 4", result)
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
		wantField  string
	}{
		// Errors from the calculator, translated by statusByCode
		{"division by zero", `{"number1":"5","operation":"divide","number2":"0"}`, 422, "DIVISION_BY_ZERO", "number2"},
		{"negative sqrt", `{"number1":"-4","operation":"sqrt"}`, 422, "NEGATIVE_SQUARE_ROOT", "number1"},
		{"fractional exponent", `{"number1":"2","operation":"power","number2":"0.5"}`, 422, "NON_INTEGER_EXPONENT", "number2"},
		{"result too large", `{"number1":"9","operation":"power","number2":"999999999"}`, 422, "RESULT_TOO_LARGE", ""},
		{"missing number2", `{"number1":"5","operation":"add"}`, 400, "INVALID_NUMBER", "number2"},
		{"non-numeric", `{"number1":"abc","operation":"add","number2":"1"}`, 400, "INVALID_NUMBER", "number1"},
		{"number too long", `{"number1":"` + strings.Repeat("1", 1001) + `","operation":"add","number2":"1"}`, 400, "NUMBER_TOO_LONG", "number1"},
		{"unknown operation", `{"number1":"1","operation":"modulo","number2":"1"}`, 400, "UNKNOWN_OPERATION", "operation"},

		// Errors from the HTTP layer itself
		{"malformed JSON", `{"number1":`, 400, "INVALID_REQUEST", ""},
		{"empty body", ``, 400, "INVALID_REQUEST", ""},
		{"not an object", `["1","add","2"]`, 400, "INVALID_REQUEST", ""},
		{"number sent as JSON number", `{"number1":12,"operation":"add","number2":"1"}`, 400, "INVALID_REQUEST", "number1"},
		{"trailing data", `{"number1":"1","operation":"add","number2":"1"} {}`, 400, "INVALID_REQUEST", ""},
		{"body too large", `{"number1":"` + strings.Repeat("1", MaxBodyBytes) + `"}`, 413, "REQUEST_TOO_LARGE", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/calculate", tt.body)
			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			body := decodeBody(t, rec)
			if body["code"] != tt.wantCode {
				t.Errorf("code = %q, want %q", body["code"], tt.wantCode)
			}
			if body["field"] != tt.wantField {
				t.Errorf("field = %q, want %q", body["field"], tt.wantField)
			}
			if body["message"] == "" {
				t.Error("message is empty")
			}
		})
	}
}

func TestEveryCalculatorCodeHasAStatus(t *testing.T) {
	codes := []calculator.Code{
		calculator.CodeInvalidNumber, calculator.CodeNumberTooLong, calculator.CodeUnknownOperation,
		calculator.CodeDivisionByZero, calculator.CodeNegativeSquareRoot,
		calculator.CodeNonIntegerExponent, calculator.CodeResultTooLarge,
	}
	for _, code := range codes {
		if _, ok := statusByCode[code]; !ok {
			t.Errorf("no HTTP status mapped for %s", code)
		}
	}
}

func TestUnexpectedErrorIsHidden(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	rec := httptest.NewRecorder()

	writeError(rec, calculatorError(errors.New("secret internal detail"), logger))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	body := decodeBody(t, rec)
	if body["code"] != "INTERNAL_ERROR" || strings.Contains(rec.Body.String(), "secret") {
		t.Errorf("internal error leaked or wrong code: %s", rec.Body.String())
	}
	if !strings.Contains(logs.String(), "secret internal detail") {
		t.Error("internal error was not logged")
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/health", "")
	if rec.Code != http.StatusOK || decodeBody(t, rec)["status"] != "ok" {
		t.Errorf("got %d %s, want 200 {status: ok}", rec.Code, rec.Body.String())
	}
}

func TestWrongMethodAndPathAnswerInJSON(t *testing.T) {
	tests := []struct {
		method, path string
		wantStatus   int
		wantCode     string
		wantAllow    string
	}{
		{http.MethodGet, "/api/v1/calculate", 405, "METHOD_NOT_ALLOWED", "POST"},
		{http.MethodDelete, "/api/health", 405, "METHOD_NOT_ALLOWED", "GET, HEAD"},
		{http.MethodPost, "/api/calculate", 404, "NOT_FOUND", ""},
		{http.MethodGet, "/", 404, "NOT_FOUND", ""},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := do(t, tt.method, tt.path, "")
			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if body := decodeBody(t, rec); body["code"] != tt.wantCode || body["message"] == "" {
				t.Errorf("body = %v, want code %s and a message", body, tt.wantCode)
			}
			if got := rec.Header().Get("Allow"); got != tt.wantAllow {
				t.Errorf("Allow = %q, want %q", got, tt.wantAllow)
			}
		})
	}
}

func TestHeadHealth(t *testing.T) {
	if rec := do(t, http.MethodHead, "/api/health", ""); rec.Code != http.StatusOK {
		t.Errorf("HEAD /api/health = %d, want 200", rec.Code)
	}
}

func TestStatusRecorderUnwraps(t *testing.T) {
	inner := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: inner}
	if rec.Unwrap() != inner {
		t.Error("Unwrap did not return the wrapped ResponseWriter")
	}
	// http.ResponseController finds Flush through Unwrap.
	if err := http.NewResponseController(rec).Flush(); err != nil {
		t.Errorf("Flush through the wrapper failed: %v", err)
	}
}

func TestRequestsAreLogged(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate",
		strings.NewReader(`{"number1":"5","operation":"divide","number2":"0"}`))
	NewRouter(logger).ServeHTTP(httptest.NewRecorder(), req)

	line := logs.String()
	for _, want := range []string{"method=POST", "path=/api/v1/calculate", "status=422", "duration="} {
		if !strings.Contains(line, want) {
			t.Errorf("log line %q missing %q", line, want)
		}
	}
}
