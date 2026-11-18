package endpoint

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSolaceServerTimingRecordsUpstreamDuration(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(25 * time.Millisecond)
		w.Header().Add("Server-Timing", "cdn;dur=82, stalwart-jmap;dur=1.250")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	endpoint := &Endpoint{Name: "upstream", URL: server.URL, Conditions: []Condition{"[STATUS] == 200"}}
	if err := endpoint.ValidateAndSetDefaults(); err != nil {
		t.Fatal(err)
	}
	if result := endpoint.EvaluateHealth(); !result.Success || result.Duration < 25*time.Millisecond {
		t.Fatalf("expected full request duration by default, got %+v", result)
	}
	endpoint.ResponseTimeMetric = "stalwart-jmap"
	if result := endpoint.EvaluateHealth(); !result.Success || result.Duration != 1250*time.Microsecond || !result.ServerTimingMeasured {
		t.Fatalf("expected 1.250ms private duration, got %+v", result)
	}
}

func TestSolaceServerTimingRejectsMissingOrInvalidDuration(t *testing.T) {
	for _, header := range []string{"cdn;dur=82", "stalwart-jmap;dur=NaN", "stalwart-jmap;dur=-10"} {
		t.Run(header, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Server-Timing", header)
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			endpoint := &Endpoint{Name: "upstream", URL: server.URL, ResponseTimeMetric: "stalwart-jmap", Conditions: []Condition{"[STATUS] == 200"}}
			if err := endpoint.ValidateAndSetDefaults(); err != nil {
				t.Fatal(err)
			}
			if result := endpoint.EvaluateHealth(); result.Success || result.Duration >= 0 || result.ServerTimingMeasured || len(result.Errors) == 0 {
				t.Fatalf("expected a failed check with no private timing, got %+v", result)
			}
		})
	}
}

func TestSolaceServerTimingKeepsARealZero(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Server-Timing", "stalwart-jmap;dur=0")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	probe := &Endpoint{Name: "upstream", URL: server.URL, ResponseTimeMetric: "stalwart-jmap", Conditions: []Condition{"[STATUS] == 200"}}
	if err := probe.ValidateAndSetDefaults(); err != nil {
		t.Fatal(err)
	}
	if result := probe.EvaluateHealth(); !result.Success || !result.ServerTimingMeasured || result.Duration != 0 {
		t.Fatalf("expected a measured zero, got %+v", result)
	}
}

func TestSolaceServerTimingMarksTransportFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	server.Close()
	probe := &Endpoint{
		Name: "upstream", URL: server.URL, ResponseTimeMetric: "stalwart-jmap",
		Conditions: []Condition{"[RESPONSE_TIME] < 10000"},
	}
	if err := probe.ValidateAndSetDefaults(); err != nil {
		t.Fatal(err)
	}
	if result := probe.EvaluateHealth(); result.Success || result.ServerTimingMeasured || result.Duration >= 0 {
		t.Fatalf("expected a failed probe without a measurement, got %+v", result)
	}
}
