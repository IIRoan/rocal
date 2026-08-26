package privacy

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

var allowedKeys = map[string]struct{}{
	"kind":          {},
	"eventId":       {},
	"minutesBefore": {},
	"inboundCount":  {},
	"subject":       {},
	"title":         {},
	"fromName":      {},
	"emailId":       {},
}

const maxSubjectLength = 200

type Payload struct {
	Kind          string `json:"kind,omitempty"`
	EventID       string `json:"eventId,omitempty"`
	MinutesBefore *int   `json:"minutesBefore,omitempty"`
	InboundCount  *int   `json:"inboundCount,omitempty"`
	Subject       string `json:"subject,omitempty"`
	Title         string `json:"title,omitempty"`
	FromName      string `json:"fromName,omitempty"`
	EmailID       string `json:"emailId,omitempty"`
}

func Parse(raw []byte) (Payload, error) {
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return Payload{}, fmt.Errorf("invalid notification job payload")
	}
	for key := range generic {
		if _, ok := allowedKeys[key]; !ok {
			return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
		}
	}
	var payload Payload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return Payload{}, fmt.Errorf("invalid notification job payload")
	}
	if payload.Kind != "" && payload.Kind != "event_reminder" && payload.Kind != "new_mail" {
		return Payload{}, fmt.Errorf("invalid notification job kind")
	}
	if payload.Kind == "event_reminder" && (strings.TrimSpace(payload.Subject) != "" || strings.TrimSpace(payload.FromName) != "" || strings.TrimSpace(payload.EmailID) != "") {
		return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
	}
	if payload.Kind == "new_mail" && (strings.TrimSpace(payload.EventID) != "" || strings.TrimSpace(payload.Title) != "") {
		return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
	}
	payload.Subject = SanitizeDisplayTitle(payload.Subject)
	payload.Title = SanitizeDisplayTitle(payload.Title)
	payload.FromName = SanitizeDisplayTitle(payload.FromName)
	return payload, nil
}

func SanitizeDisplayTitle(value string) string {
	trimmed := strings.TrimSpace(strings.Join(strings.Fields(value), " "))
	if trimmed == "" {
		return ""
	}
	if utf8.RuneCountInString(trimmed) <= maxSubjectLength {
		return trimmed
	}
	runes := []rune(trimmed)
	return strings.TrimSpace(string(runes[:maxSubjectLength]))
}
