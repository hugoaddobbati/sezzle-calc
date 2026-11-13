package api

import (
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"strings"
	"testing"
)

// contractFile is shared with the frontend tests, so both sides are checked
// against the same requests, statuses, results and messages.
const contractFile = "../../../contract/calculations.json"

type contractCase struct {
	Name     string            `json:"name"`
	Request  map[string]string `json:"request"`
	Status   int               `json:"status"`
	Response map[string]any    `json:"response"`
}

func TestContract(t *testing.T) {
	data, err := os.ReadFile(contractFile)
	if err != nil {
		t.Fatalf("reading %s: %v", contractFile, err)
	}
	var contract struct {
		Cases []contractCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatalf("parsing %s: %v", contractFile, err)
	}
	if len(contract.Cases) == 0 {
		t.Fatal("contract has no cases")
	}

	for _, tc := range contract.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			body, _ := json.Marshal(tc.Request)
			rec := do(t, http.MethodPost, "/api/v1/calculate", string(body))

			if rec.Code != tc.Status {
				t.Errorf("status = %d, want %d", rec.Code, tc.Status)
			}
			var got map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("response is not JSON: %q", rec.Body.String())
			}
			if !reflect.DeepEqual(got, tc.Response) {
				t.Errorf("response = %s\nwant       %v", strings.TrimSpace(rec.Body.String()), tc.Response)
			}
		})
	}
}
