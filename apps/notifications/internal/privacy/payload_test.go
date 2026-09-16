package privacy

import "testing"

func TestParseRejectsContentFields(t *testing.T) {
	_, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"from":"Secret"}`))
	if err == nil {
		t.Fatal("expected content fields to be rejected")
	}
}

func TestParseAllowsMetadata(t *testing.T) {
	payload, err := Parse([]byte(`{"kind":"event_reminder","eventId":"evt-1","minutesBefore":15}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload.EventID != "evt-1" || payload.Kind != "event_reminder" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}

func TestParseAllowsNewMailRefs(t *testing.T) {
	payload, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"emailId":" em-1 ","accountId":"n"}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload.EmailID != "em-1" || payload.AccountID != "n" {
		t.Fatalf("unexpected payload %+v", payload)
	}
}

func TestParseToleratesLegacyPlaintextKeysWithoutDecodingThem(t *testing.T) {
	payload, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"subject":"Lunch","fromName":"Sam","emailId":"em-1"}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload != (Payload{Kind: "new_mail", InboundCount: payload.InboundCount, EmailID: "em-1"}) {
		t.Fatalf("unexpected payload %+v", payload)
	}
	if _, err := Parse([]byte(`{"kind":"event_reminder","eventId":"evt-1","minutesBefore":15,"title":"Lunch"}`)); err != nil {
		t.Fatal(err)
	}
}

func TestParseRejectsMailRefsOnEventReminder(t *testing.T) {
	_, err := Parse([]byte(`{"kind":"event_reminder","eventId":"evt-1","minutesBefore":15,"emailId":"em-1"}`))
	if err == nil {
		t.Fatal("expected event reminder emailId to be rejected")
	}
}

func TestParseRejectsEventIDOnNewMail(t *testing.T) {
	_, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"eventId":"evt-1"}`))
	if err == nil {
		t.Fatal("expected new-mail eventId to be rejected")
	}
}
