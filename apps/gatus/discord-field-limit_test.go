package discord

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/TwiN/gatus/v5/alerting/alert"
	"github.com/TwiN/gatus/v5/config/endpoint"
)

func TestSolaceDiscordConditionsFitFieldLimit(t *testing.T) {
	for _, resolved := range []bool{false, true} {
		result := &endpoint.Result{}
		for i := 0; i < 20; i++ {
			result.ConditionResults = append(result.ConditionResults, &endpoint.ConditionResult{
				Condition: "[BODY] (" + strings.Repeat("unavailable", 12) + ") == pat(*server_memory*)",
			})
		}
		provider := &AlertProvider{}
		var body Body
		if err := json.Unmarshal(provider.buildRequestBody(&Config{}, &endpoint.Endpoint{Name: "stalwart-metrics"}, &alert.Alert{}, result, resolved), &body); err != nil {
			t.Fatal(err)
		}
		field := body.Embeds[0].Fields[0].Value
		if utf8.RuneCountInString(field) > 1024 {
			t.Fatalf("Discord rejects the %d-character condition field", utf8.RuneCountInString(field))
		}
		if !strings.HasSuffix(field, "...") {
			t.Fatal("truncated condition details must be marked")
		}
	}
}

func TestSolaceDiscordShortConditionsArePreserved(t *testing.T) {
	provider := &AlertProvider{}
	result := &endpoint.Result{ConditionResults: []*endpoint.ConditionResult{{Condition: "[STATUS] == 200", Success: true}}}
	var body Body
	if err := json.Unmarshal(provider.buildRequestBody(&Config{}, &endpoint.Endpoint{Name: "api-health"}, &alert.Alert{}, result, false), &body); err != nil {
		t.Fatal(err)
	}
	if body.Embeds[0].Fields[0].Value != ":white_check_mark: - `[STATUS] == 200`\n" {
		t.Fatal("short alerts must keep every condition")
	}
}
