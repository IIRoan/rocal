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