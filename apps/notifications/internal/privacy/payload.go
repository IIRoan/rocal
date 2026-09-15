package privacy

import (
	"encoding/json"
	"fmt"
	"strings"
)

// notification_job.payload carries opaque references only. Reminder titles and
// mail sender/subject are decrypted or fetched on-device by the iOS
// Notification Service Extension.
var allowedKeys = map[string]struct{}{
	"kind":          {},
	"eventId":       {},
	"minutesBefore": {},
	"inboundCount":  {},
	"emailId":       {},
	"accountId":     {},
}

// Plaintext keys written by backends before encrypted reminder titles. Rows
// that still carry them are delivered, but the values are never decoded.
var legacyIgnoredKeys = map[string]struct{}{
	"subject":  {},
	"title":    {},
	"fromName": {},
}

const maxOpaqueIDLength = 128

type Payload struct {
	Kind          string `json:"kind,omitempty"`
	EventID       string `json:"eventId,omitempty"`
	MinutesBefore *int   `json:"minutesBefore,omitempty"`
	InboundCount  *int   `json:"inboundCount,omitempty"`
	EmailID       string `json:"emailId,omitempty"`
	AccountID     string `json:"accountId,omitempty"`
}

func Parse(raw []byte) (Payload, error) {
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		return Payload{}, fmt.Errorf("invalid notification job payload")
	}
	for key := range generic {
		if _, ok := allowedKeys[key]; ok {
			continue
		}
		if _, ok := legacyIgnoredKeys[key]; ok {
			continue
		}
		return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
	}
	var payload Payload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return Payload{}, fmt.Errorf("invalid notification job payload")
	}
	payload.EventID = strings.TrimSpace(payload.EventID)
	payload.EmailID = strings.TrimSpace(payload.EmailID)
	payload.AccountID = strings.TrimSpace(payload.AccountID)
	if payload.Kind != "" && payload.Kind != "event_reminder" && payload.Kind != "new_mail" {
		return Payload{}, fmt.Errorf("invalid notification job kind")
	}
	if payload.Kind == "event_reminder" && (payload.EmailID != "" || payload.AccountID != "") {
		return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
	}
	if payload.Kind == "new_mail" && payload.EventID != "" {
		return Payload{}, fmt.Errorf("notification job payload contains disallowed fields")
	}
	if len(payload.EventID) > maxOpaqueIDLength || len(payload.EmailID) > maxOpaqueIDLength || len(payload.AccountID) > maxOpaqueIDLength {
		return Payload{}, fmt.Errorf("invalid notification job payload")
	}
	return payload, nil
}
