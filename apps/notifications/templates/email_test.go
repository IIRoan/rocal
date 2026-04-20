package templates

import (
	"strings"
	"testing"
)

func TestRenderEventReminderIncludesTemplateData(t *testing.T) {
	html, err := RenderEventReminder(EmailTemplateData{
		EventTitle:     "Quarterly Planning",
		EventDate:      "Friday, Apr 18",
		EventTime:      "9:00 AM - 10:00 AM",
		EventLocation:  "Amsterdam",
		CalendarName:   "Work",
		TimeUntilEvent: "30 minutes",
		Duration:       "1h",
		UserName:       "Roan",
		EventUrl:       "https://app.solace.test/dashboard?eventId=evt-1",
		CalendarUrl:    "https://app.solace.test/dashboard",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
	})
	if err != nil {
		t.Fatalf("unexpected template render error: %v", err)
	}

	assertions := []string{
		"Quarterly Planning",
		"Friday, Apr 18",
		"Amsterdam",
		"https://app.solace.test/dashboard?eventId=evt-1",
		"https://app.solace.test/settings",
	}

	for _, expected := range assertions {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected rendered html to contain %q, got %q", expected, html)
		}
	}
}

func TestGeneratePlainTextEmailIncludesOptionalFields(t *testing.T) {
	text := GeneratePlainTextEmail(EmailTemplateData{
		EventTitle:     "Design Review",
		EventDate:      "Saturday, Apr 19",
		EventTime:      "3:00 PM - 4:00 PM",
		EventLocation:  "Remote",
		Duration:       "1h",
		TimeUntilEvent: "1 hour",
		EventUrl:       "https://app.solace.test/dashboard?eventId=evt-2",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
		CalendarUrl:    "https://app.solace.test/dashboard",
	})

	assertions := []string{
		"1 hour",
		"Design Review",
		"Location: Remote",
		"Duration: 1h",
		"Open event: https://app.solace.test/dashboard?eventId=evt-2",
		"Settings: https://app.solace.test/settings",
	}

	for _, expected := range assertions {
		if !strings.Contains(text, expected) {
			t.Fatalf("expected plain text email to contain %q, got %q", expected, text)
		}
	}
}

func TestRenderEventReminderWithLogoUrl(t *testing.T) {
	html, err := RenderEventReminder(EmailTemplateData{
		EventTitle:     "Logo Test",
		EventDate:      "Monday, May 1",
		EventTime:      "10:00 AM",
		TimeUntilEvent: "15 minutes",
		EventUrl:       "https://app.solace.test/dashboard",
		CalendarUrl:    "https://app.solace.test/dashboard",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
		LogoUrl:        "https://solace.onl/favicon-192x192.png",
	})
	if err != nil {
		t.Fatalf("unexpected render error: %v", err)
	}

	if !strings.Contains(html, "https://solace.onl/favicon-192x192.png") {
		t.Fatal("expected rendered HTML to contain logo URL")
	}
	if !strings.Contains(html, `alt="Solace"`) {
		t.Fatal("expected logo alt text")
	}
}

func TestRenderEventReminderOmitsConditionalFields(t *testing.T) {
	html, err := RenderEventReminder(EmailTemplateData{
		EventTitle:     "Minimal Event",
		EventDate:      "Tuesday, Jun 1",
		EventTime:      "2:00 PM",
		TimeUntilEvent: "30 minutes",
		EventUrl:       "https://app.solace.test/dashboard",
		CalendarUrl:    "https://app.solace.test/dashboard",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
	})
	if err != nil {
		t.Fatalf("unexpected render error: %v", err)
	}

	if strings.Contains(html, "Location") {
		t.Fatal("expected Location field to be omitted when empty")
	}
	// The word "Calendar" appears in the footer link, so count occurrences:
	// with no CalendarName, only the footer link should contain it
	calendarCount := strings.Count(html, "Calendar")
	if calendarCount != 1 {
		t.Fatalf("expected exactly 1 'Calendar' occurrence (footer link), got %d", calendarCount)
	}
	if strings.Contains(html, "Duration") {
		t.Fatal("expected Duration field to be omitted when empty")
	}
}

func TestRenderEventReminderIncludesAllConditionalFields(t *testing.T) {
	html, err := RenderEventReminder(EmailTemplateData{
		EventTitle:     "Full Event",
		EventDate:      "Wednesday, Jul 1",
		EventTime:      "3:00 PM - 4:30 PM",
		EventLocation:  "Room 42",
		CalendarName:   "Engineering",
		Duration:       "1h 30m",
		TimeUntilEvent: "1 hour",
		EventUrl:       "https://app.solace.test/dashboard?eventId=full",
		CalendarUrl:    "https://app.solace.test/dashboard",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
	})
	if err != nil {
		t.Fatalf("unexpected render error: %v", err)
	}

	for _, want := range []string{"Room 42", "Engineering", "1h 30m", "1 hour"} {
		if !strings.Contains(html, want) {
			t.Fatalf("expected rendered HTML to contain %q", want)
		}
	}
}

func TestGeneratePlainTextEmailOmitsOptionalFields(t *testing.T) {
	text := GeneratePlainTextEmail(EmailTemplateData{
		EventTitle:     "Quick Sync",
		EventDate:      "Thursday, Aug 1",
		EventTime:      "11:00 AM",
		TimeUntilEvent: "5 minutes",
		EventUrl:       "https://app.solace.test/dashboard?eventId=evt-q",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
		CalendarUrl:    "https://app.solace.test/dashboard",
	})

	if strings.Contains(text, "Location:") {
		t.Fatal("expected no Location in plain text when empty")
	}
	if strings.Contains(text, "Duration:") {
		t.Fatal("expected no Duration in plain text when empty")
	}
	if !strings.Contains(text, "Quick Sync") {
		t.Fatal("expected event title in plain text")
	}
	if !strings.Contains(text, "Date: Thursday, Aug 1") {
		t.Fatal("expected date in plain text")
	}
}

func TestRenderEventReminderHasValidHTMLStructure(t *testing.T) {
	html, err := RenderEventReminder(EmailTemplateData{
		EventTitle:     "Structure Test",
		EventDate:      "Friday, Sep 1",
		EventTime:      "9:00 AM",
		TimeUntilEvent: "10 minutes",
		EventUrl:       "https://app.solace.test/dashboard",
		CalendarUrl:    "https://app.solace.test/dashboard",
		SettingsUrl:    "https://app.solace.test/settings",
		PrivacyUrl:     "https://app.solace.test/privacy",
	})
	if err != nil {
		t.Fatalf("unexpected render error: %v", err)
	}

	if !strings.Contains(html, "<!DOCTYPE") {
		t.Fatal("expected DOCTYPE in rendered HTML")
	}
	if !strings.Contains(html, "<html") {
		t.Fatal("expected html tag")
	}
	if !strings.Contains(html, "</html>") {
		t.Fatal("expected closing html tag")
	}
	if !strings.Contains(html, "<body") {
		t.Fatal("expected body tag")
	}
	if !strings.Contains(html, "Open Event") {
		t.Fatal("expected CTA button text")
	}
	if !strings.Contains(html, "Settings") {
		t.Fatal("expected Settings footer link")
	}
	if !strings.Contains(html, "Privacy") {
		t.Fatal("expected Privacy footer link")
	}
}