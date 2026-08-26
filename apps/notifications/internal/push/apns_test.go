package push

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEventReminderUsesProvidedTitle(t *testing.T) {
	payload := MetadataPayload(EventReminder(15, "evt-1", "Lunch with Sam"))
	raw, _ := json.Marshal(payload)
	if payload["t"] != "event" || payload["eid"] != "evt-1" {
		t.Fatalf("unexpected payload: %s", raw)
	}
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "Lunch with Sam" {
		t.Fatalf("unexpected title %v", alert["title"])
	}
	if _, ok := payload["subject"]; ok {
		t.Fatalf("custom payload should not include subject: %s", raw)
	}
}

func TestNewMailUsesSenderAndSubject(t *testing.T) {
	notification := NewMail(1, "Sam Wilson", "Invoice attached", "em-1")
	payload := MetadataPayload(notification)
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "Sam Wilson" || alert["body"] != "Invoice attached" {
		t.Fatalf("unexpected alert %+v", alert)
	}
	if payload["t"] != "mail" || payload["mid"] != "em-1" {
		t.Fatalf("unexpected payload %+v", payload)
	}
	if notification.CollapseID != "mail:em-1" {
		t.Fatalf("unexpected collapse id %q", notification.CollapseID)
	}
	if aps["thread-id"] != "mail:em-1" {
		t.Fatalf("unexpected thread-id %v", aps["thread-id"])
	}
}

func TestNewMailFallsBackWithoutSender(t *testing.T) {
	payload := MetadataPayload(NewMail(1, "", "Invoice attached", "em-2"))
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "New email" || alert["body"] != "Invoice attached" {
		t.Fatalf("unexpected alert %+v", alert)
	}
}

func TestNewMailCollapsesMultipleMessages(t *testing.T) {
	payload := MetadataPayload(NewMail(3, "Sam", "Invoice attached", ""))
	aps := payload["aps"].(map[string]any)
	alert := aps["alert"].(map[string]any)
	if alert["title"] != "New email" || alert["body"] != "3 new emails" {
		t.Fatalf("unexpected alert %+v", alert)
	}
}

func TestNewMailKeepsDistinctCollapseIDs(t *testing.T) {
	first := NewMail(1, "Sam", "First", "em-1")
	second := NewMail(1, "Sam", "Second", "em-2")
	if first.CollapseID == second.CollapseID {
		t.Fatalf("expected distinct collapse ids, got %q", first.CollapseID)
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

	result, err := client.Send(Device{Token: "abcd", BundleID: "onl.solace.mobile", Environment: "production"}, NewMail(1, "", "", "em-1"))
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

	result, err := client.Send(Device{Token: "abcd", BundleID: "onl.solace.mobile.dev", Environment: "sandbox"}, NewMail(1, "", "", "em-1"))
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
