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

func TestParseAllowsNewMailSubjectAndFromName(t *testing.T) {
	payload, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"subject":"  Lunch plans  ","fromName":"  Sam  ","emailId":"em-1"}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload.Subject != "Lunch plans" || payload.FromName != "Sam" || payload.EmailID != "em-1" {
		t.Fatalf("unexpected payload %+v", payload)
	}
}

func TestParseAllowsEventReminderTitle(t *testing.T) {
	payload, err := Parse([]byte(`{"kind":"event_reminder","eventId":"evt-1","minutesBefore":15,"title":"  Lunch with Sam  "}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload.Title != "Lunch with Sam" {
		t.Fatalf("unexpected title %q", payload.Title)
	}
}

func TestParseRejectsSubjectOnEventReminder(t *testing.T) {
	_, err := Parse([]byte(`{"kind":"event_reminder","eventId":"evt-1","minutesBefore":15,"subject":"Lunch"}`))
	if err == nil {
		t.Fatal("expected event reminder subject to be rejected")
	}
}

func TestParseRejectsTitleOnNewMail(t *testing.T) {
	_, err := Parse([]byte(`{"kind":"new_mail","inboundCount":1,"title":"Secret"}`))
	if err == nil {
		t.Fatal("expected new-mail title to be rejected")
	}
}
