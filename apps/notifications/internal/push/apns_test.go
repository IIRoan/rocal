package push

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testCiphertext = "v1.oKGio6Slpqeoqaqr.RzKqGz6RlCIjsse98Z5olLmi5f7PQ06_sfA4TvGmoA"

func TestEventReminderIsGenericWithCiphertext(t *testing.T) {
	payload := MetadataPayload(EventReminder(15, "evt-1", testCiphertext, "15:30"))
	raw, _ := json.Marshal(payload)
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "Event reminder" || alert["body"] != "Starts at 15:30" {
		t.Fatalf("unexpected alert %+v", alert)
	}
	if aps["mutable-content"] != 1 {
		t.Fatalf("expected mutable-content: %s", raw)
	}
	if payload["type"] != "event_reminder" || payload["eventId"] != "evt-1" || payload["enc"] != testCiphertext {
		t.Fatalf("unexpected custom keys: %s", raw)
	}
	body, ok := payload["body"].(map[string]any)
	if !ok || body["t"] != "event" || body["eid"] != "evt-1" {
		t.Fatalf("unexpected legacy tap data: %s", raw)
	}
	if _, ok := body["enc"]; ok {
		t.Fatalf("ciphertext should not be exposed as JS notification data: %s", raw)
	}
}

func TestEventReminderFallsBackToLeadTime(t *testing.T) {
	alert := MetadataPayload(EventReminder(1, "evt-1", "", ""))["aps"].(map[string]any)["alert"].(map[string]any)
	if alert["body"] != "Starts in 1 minute" {
		t.Fatalf("unexpected alert %+v", alert)
	}
	payload := MetadataPayload(EventReminder(0, "evt-1", "", ""))
	if _, ok := payload["enc"]; ok {
		t.Fatal("expected no enc key without ciphertext")
	}
}

func TestNewMailIsGenericWithOpaqueRefs(t *testing.T) {
	notification := NewMail(1, "em-1", "n")
	payload := MetadataPayload(notification)
	raw, _ := json.Marshal(payload)
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "New mail" || alert["body"] != "You have a new message" {
		t.Fatalf("unexpected alert %+v", alert)
	}
	if aps["mutable-content"] != 1 {
		t.Fatalf("expected mutable-content: %s", raw)
	}
	if payload["type"] != "new_mail" || payload["emailId"] != "em-1" || payload["accountId"] != "n" {
		t.Fatalf("unexpected custom keys: %s", raw)
	}
	body, ok := payload["body"].(map[string]any)
	if !ok || body["t"] != "mail" || body["mid"] != "em-1" {
		t.Fatalf("unexpected payload %+v", payload)
	}
	if notification.CollapseID != "mail:em-1" || aps["thread-id"] != "mail:em-1" {
		t.Fatalf("unexpected collapse id %q", notification.CollapseID)
	}
}

func TestNewMailCountsMultipleMessages(t *testing.T) {
	alert := MetadataPayload(NewMail(3, "", ""))["aps"].(map[string]any)["alert"].(map[string]any)
	if alert["title"] != "New mail" || alert["body"] != "3 new messages" {
		t.Fatalf("unexpected alert %+v", alert)
	}
}

func TestNewMailKeepsDistinctCollapseIDs(t *testing.T) {
	first := NewMail(1, "em-1", "n")
	second := NewMail(1, "em-2", "n")
	if first.CollapseID == second.CollapseID {
		t.Fatalf("expected distinct collapse ids, got %q", first.CollapseID)
	}
}

func TestEncodePayloadDropsCiphertextOverLimit(t *testing.T) {
	notification := EventReminder(15, "evt-1", "v1.oKGio6Slpqeoqaqr."+strings.Repeat("A", MaxPayloadBytes), "15:30")
	body, err := EncodePayload(notification)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) > MaxPayloadBytes {
		t.Fatalf("payload too large: %d", len(body))
	}
	if strings.Contains(string(body), `"enc"`) {
		t.Fatal("expected enc to be omitted when over the APNs limit")
	}

	body, err = EncodePayload(EventReminder(15, "evt-1", testCiphertext, "15:30"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), testCiphertext) {
		t.Fatal("expected enc to be kept within the limit")
	}
}

func TestSendMarksUnregistered(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if string(body) == "" {
			t.Fatal("expected APNs body")
		}
		w.WriteHeader(http.StatusGone)
		_ = json.NewEncoder(w).Encode(map[string]string{"reason": "Unregistered"})
	}))
	defer server.Close()

	pemBytes, err := GenerateTestKeyPEM()
	if err != nil {
		t.Fatal(err)
	}
	key, err := ParseAuthKey(pemBytes)
	if err != nil {
		t.Fatal(err)
	}
	client := NewClient("KEYID", "TEAMID", key, server.Client())
	client.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Scheme = "http"
		req.URL.Host = server.Listener.Addr().String()
		return http.DefaultTransport.RoundTrip(req)
	})

	result, err := client.Send(Device{Token: "abcd", BundleID: "onl.solace.mobile", Environment: "production"}, NewMail(1, "em-1", ""))
	if err != nil {
		t.Fatal(err)
	}
	if !result.Unregistered {
		t.Fatalf("expected unregistered, got %+v", result)
	}
}

func TestSendBadDeviceTokenIsNotUnregistered(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"reason": "BadDeviceToken"})
	}))
	defer server.Close()

	pemBytes, err := GenerateTestKeyPEM()
	if err != nil {
		t.Fatal(err)
	}
	key, err := ParseAuthKey(pemBytes)
	if err != nil {
		t.Fatal(err)
	}
	client := NewClient("KEYID", "TEAMID", key, server.Client())
	client.http.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Scheme = "http"
		req.URL.Host = server.Listener.Addr().String()
		return http.DefaultTransport.RoundTrip(req)
	})

	result, err := client.Send(Device{Token: "abcd", BundleID: "onl.solace.mobile.dev", Environment: "sandbox"}, NewMail(1, "em-1", ""))
	if err != nil {
		t.Fatal(err)
	}
	if result.Unregistered {
		t.Fatalf("BadDeviceToken should not delete the device, got %+v", result)
	}
	if result.Reason != "BadDeviceToken" {
		t.Fatalf("unexpected reason %+v", result)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
