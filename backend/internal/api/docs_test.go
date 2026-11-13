package api

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"testing"

	"calculator/internal/calculator"
)

// openAPI is the part of the OpenAPI description these tests check.
type openAPI struct {
	OpenAPI string `json:"openapi"`
	Paths   map[string]map[string]struct {
		Responses map[string]json.RawMessage `json:"responses"`
	} `json:"paths"`
	Components struct {
		Schemas struct {
			CalculateRequest struct {
				Properties struct {
					Operation struct {
						Enum []string `json:"enum"`
					} `json:"operation"`
				} `json:"properties"`
			} `json:"CalculateRequest"`
			Number struct {
				Pattern string `json:"pattern"`
			} `json:"Number"`
			Error struct {
				Properties struct {
					Code struct {
						Enum []string `json:"enum"`
					} `json:"code"`
				} `json:"properties"`
			} `json:"Error"`
		} `json:"schemas"`
	} `json:"components"`
}

func loadSpec(t *testing.T) openAPI {
	t.Helper()
	rec := do(t, http.MethodGet, "/api/openapi.json", "")
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("GET /api/openapi.json = %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	var spec openAPI
	if err := json.Unmarshal(rec.Body.Bytes(), &spec); err != nil {
		t.Fatalf("spec is not valid JSON: %v", err)
	}
	return spec
}

func TestSpecDescribesTheRoutes(t *testing.T) {
	spec := loadSpec(t)
	if spec.OpenAPI != "3.1.0" {
		t.Errorf("openapi = %q, want 3.1.0", spec.OpenAPI)
	}
	if _, ok := spec.Paths["/api/v1/calculate"]["post"]; !ok {
		t.Error("spec is missing POST /api/v1/calculate")
	}
	if _, ok := spec.Paths["/api/health"]["get"]; !ok {
		t.Error("spec is missing GET /api/health")
	}
}

func TestSpecMatchesTheCode(t *testing.T) {
	spec := loadSpec(t)
	schemas := spec.Components.Schemas

	// Operations
	var operations []string
	for _, op := range calculator.Operations {
		operations = append(operations, string(op))
	}
	if !slices.Equal(schemas.CalculateRequest.Properties.Operation.Enum, operations) {
		t.Errorf("spec operations = %v, want %v", schemas.CalculateRequest.Properties.Operation.Enum, operations)
	}

	// Number format: the same pattern the calculator enforces (parse.go).
	if schemas.Number.Pattern != `^-?[0-9]+(\.[0-9]+)?$` {
		t.Errorf("spec number pattern = %q", schemas.Number.Pattern)
	}

	// Every error code the API can return, and nothing else.
	want := []string{CodeInvalidRequest, CodeRequestTooLarge, CodeNotFound, CodeMethodNotAllowed, CodeInternalError}
	for code := range statusByCode {
		want = append(want, string(code))
	}
	got := slices.Clone(schemas.Error.Properties.Code.Enum)
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Errorf("spec error codes = %v\nwant              %v", got, want)
	}

	// Every status the calculate endpoint can return is documented, with each calculator code as an example.
	responses := spec.Paths["/api/v1/calculate"]["post"].Responses
	for code, status := range statusByCode {
		raw, ok := responses[strconv.Itoa(status)]
		if !ok {
			t.Errorf("spec has no %d response (needed for %s)", status, code)
			continue
		}
		if !strings.Contains(string(raw), `"`+string(code)+`"`) {
			t.Errorf("spec %d response has no %s example", status, code)
		}
	}
	for _, status := range []string{"200", "405", "413", "500"} {
		if _, ok := responses[status]; !ok {
			t.Errorf("spec has no %s response", status)
		}
	}
}

func TestDocsPage(t *testing.T) {
	rec := do(t, http.MethodGet, "/api/docs", "")
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("GET /api/docs = %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	for _, want := range []string{"swagger-ui-dist@" + swaggerUIVersion, "url: '/api/openapi.json'"} {
		if !strings.Contains(body, want) {
			t.Errorf("docs page is missing %q", want)
		}
	}
}

func TestDocsRoutesRejectOtherMethods(t *testing.T) {
	for _, path := range []string{"/api/docs", "/api/openapi.json"} {
		if rec := do(t, http.MethodPost, path, ""); rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("POST %s = %d, want 405", path, rec.Code)
		}
	}
}
