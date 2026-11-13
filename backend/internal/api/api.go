// Package api exposes the calculator over HTTP. It owns everything HTTP- and
// JSON-specific: routing, body limits, decoding, and translating calculator
// error codes into status codes.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"calculator/internal/calculator"
)

// MaxBodyBytes limits the size of a request body.
const MaxBodyBytes = 16 << 10 // 16 KB

// Codes produced by the HTTP layer itself (the rest come from the calculator).
const (
	CodeInvalidRequest   = "INVALID_REQUEST"
	CodeRequestTooLarge  = "REQUEST_TOO_LARGE"
	CodeNotFound         = "NOT_FOUND"
	CodeMethodNotAllowed = "METHOD_NOT_ALLOWED"
	CodeInternalError    = "INTERNAL_ERROR"
)

// statusByCode translates calculator error codes into HTTP status codes:
// 400 when the input breaks the API's rules, 422 when the input is valid but
// the maths cannot produce an answer.
var statusByCode = map[calculator.Code]int{
	calculator.CodeInvalidNumber:      http.StatusBadRequest,
	calculator.CodeNumberTooLong:      http.StatusBadRequest,
	calculator.CodeUnknownOperation:   http.StatusBadRequest,
	calculator.CodeDivisionByZero:     http.StatusUnprocessableEntity,
	calculator.CodeNegativeSquareRoot: http.StatusUnprocessableEntity,
	calculator.CodeNonIntegerExponent: http.StatusUnprocessableEntity,
	calculator.CodeResultTooLarge:     http.StatusUnprocessableEntity,
}

type calculateRequest struct {
	Number1   string `json:"number1"`
	Operation string `json:"operation"`
	Number2   string `json:"number2"`
}

type calculateResponse struct {
	Result  string `json:"result"`
	Rounded bool   `json:"rounded"`
}

// errorResponse is the JSON body of every error.
type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// apiError is an error response together with its HTTP status.
type apiError struct {
	status int
	body   errorResponse
}

// NewRouter returns the HTTP handler for the whole API, with request logging.
// Every response, including 404 and 405, is JSON.
func NewRouter(logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", func(w http.ResponseWriter, r *http.Request) {
		handleCalculate(w, r, logger)
	})
	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/openapi.json", handleOpenAPISpec)
	mux.HandleFunc("GET /api/docs", handleDocs)

	// Paths without a method match every other method: answer 405 in JSON
	// instead of the router's plain-text default. "/" catches everything else.
	mux.HandleFunc("/api/v1/calculate", methodNotAllowed("POST"))
	for _, path := range []string{"/api/health", "/api/openapi.json", "/api/docs"} {
		mux.HandleFunc(path, methodNotAllowed("GET, HEAD"))
	}
	mux.HandleFunc("/", handleNotFound)

	return logRequests(logger, mux)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, &apiError{
		status: http.StatusNotFound,
		body:   errorResponse{Code: CodeNotFound, Message: "Endpoint not found."},
	})
}

func methodNotAllowed(allowed string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", allowed)
		writeError(w, &apiError{
			status: http.StatusMethodNotAllowed,
			body: errorResponse{
				Code:    CodeMethodNotAllowed,
				Message: fmt.Sprintf("Method %s is not allowed here. Allowed: %s.", r.Method, allowed),
			},
		})
	}
}

func handleCalculate(w http.ResponseWriter, r *http.Request, logger *slog.Logger) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)

	req, decodeErr := decodeRequest(r.Body)
	if decodeErr != nil {
		writeError(w, decodeErr)
		return
	}

	result, err := calculator.Calculate(req.Number1, req.Operation, req.Number2)
	if err != nil {
		writeError(w, calculatorError(err, logger))
		return
	}
	writeJSON(w, http.StatusOK, calculateResponse{Result: result.Value, Rounded: result.Rounded})
}

// decodeRequest reads exactly one JSON object from body.
func decodeRequest(body io.Reader) (calculateRequest, *apiError) {
	var req calculateRequest
	dec := json.NewDecoder(body)

	if err := dec.Decode(&req); err != nil {
		return req, decodeError(err)
	}
	// Anything after the object (a second object, stray text) is rejected.
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return req, decodeError(err)
	}
	return req, nil
}

func decodeError(err error) *apiError {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return &apiError{
			status: http.StatusRequestEntityTooLarge,
			body: errorResponse{
				Code:    CodeRequestTooLarge,
				Message: fmt.Sprintf("Request body must be at most %d bytes.", MaxBodyBytes),
			},
		}
	}

	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) && typeErr.Field != "" {
		return &apiError{
			status: http.StatusBadRequest,
			body: errorResponse{
				Code:    CodeInvalidRequest,
				Message: typeErr.Field + " must be a string.",
				Field:   typeErr.Field,
			},
		}
	}

	return &apiError{
		status: http.StatusBadRequest,
		body: errorResponse{
			Code:    CodeInvalidRequest,
			Message: `Request body must be one JSON object like {"number1": "12", "operation": "divide", "number2": "4"}.`,
		},
	}
}

// calculatorError turns a calculator failure into an API error. Unknown
// errors are logged in full but never shown to the client.
func calculatorError(err error, logger *slog.Logger) *apiError {
	var calcErr *calculator.Error
	if errors.As(err, &calcErr) {
		if status, ok := statusByCode[calcErr.Code]; ok {
			return &apiError{
				status: status,
				body:   errorResponse{Code: string(calcErr.Code), Message: calcErr.Message, Field: calcErr.Field},
			}
		}
	}
	logger.Error("unexpected calculator error", "error", err)
	return &apiError{
		status: http.StatusInternalServerError,
		body:   errorResponse{Code: CodeInternalError, Message: "Something went wrong. Please try again."},
	}
}

func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.status, e.body)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body) // nothing useful to do if the client went away
}
