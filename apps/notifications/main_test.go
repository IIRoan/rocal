package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"strings"
	"testing"
	"time"

	"github.com/resend/resend-go/v2"
)

func TestNewNotificationServerDefaults(t *testing.T) {
	server := NewNotificationServer()

	if server.cron == nil {
		t.Fatal("expected cron scheduler to be initialized")
	}
	if server.maxErrors != 50 {
		t.Fatalf("expected maxErrors to default to 50, got %d", server.maxErrors)
	}
	if server.isRunning {
		t.Fatal("expected server to start stopped")
	}
	if len(server.errors) != 0 {
		t.Fatalf("expected no startup errors, got %d", len(server.errors))
	}
}

func TestAddErrorKeepsNewestEntries(t *testing.T) {
	server := NewNotificationServer()
	server.maxErrors = 3

	server.addError("first")
	server.addError("second")
	server.addError("third")
	server.addError("fourth")

	if len(server.errors) != 3 {
		t.Fatalf("expected 3 retained errors, got %d", len(server.errors))
	}

	got := []string{server.errors[0].Error, server.errors[1].Error, server.errors[2].Error}
	want := []string{"second", "third", "fourth"}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("expected retained errors %v, got %v", want, got)
		}
	}
}

func TestProcessScheduledNotificationsRequiresDatabase(t *testing.T) {
	server := NewNotificationServer()

	err := server.processScheduledNotifications()
	if err == nil {
		t.Fatal("expected error when database is not configured")
	}
	if !strings.Contains(err.Error(), "database service not configured") {
		t.Fatalf("unexpected error: %v", err)
	}
	if server.lastProcessedAt == nil {
		t.Fatal("expected processing attempt to update lastProcessedAt")
	}
}

func TestCalculateEventDuration(t *testing.T) {
	server := NewNotificationServer()
	start := time.Date(2026, time.January, 10, 9, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		end    time.Time
		allDay bool
		want   string
	}{
		{name: "all day event", end: start.Add(8 * time.Hour), allDay: true, want: "All day"},
		{name: "hours and minutes", end: start.Add(90 * time.Minute), want: "1h 30m"},
		{name: "hours only", end: start.Add(2 * time.Hour), want: "2h"},
		{name: "minutes only", end: start.Add(45 * time.Minute), want: "45m"},
		{name: "non-positive duration", end: start, want: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := server.calculateEventDuration(start, test.end, test.allDay)
			if got != test.want {
				t.Fatalf("expected %q, got %q", test.want, got)
			}
		})
	}
}

func TestReminderFormatting(t *testing.T) {
	server := NewNotificationServer()

	tests := []struct {
		minutes int
		text    string
		summary string
	}{
		{minutes: 0, text: "Your event is starting now", summary: "starting now"},
		{minutes: 1, text: "Your event starts in 1 minute", summary: "1 minute"},
		{minutes: 30, text: "Your event starts in 30 minutes", summary: "30 minutes"},
		{minutes: 60, text: "Your event starts in 1 hour", summary: "1 hour"},
		{minutes: 90, text: "Your event starts in 1h 30m", summary: "1 hour 30 minutes"},
		{minutes: 180, text: "Your event starts in 3 hours", summary: "3 hours"},
	}

	for _, test := range tests {
		t.Run(test.summary, func(t *testing.T) {
			if got := server.formatReminderText(test.minutes); got != test.text {
				t.Fatalf("formatReminderText(%d) = %q, want %q", test.minutes, got, test.text)
			}
			if got := server.formatReminderSummary(test.minutes); got != test.summary {
				t.Fatalf("formatReminderSummary(%d) = %q, want %q", test.minutes, got, test.summary)
			}
		})
	}
}

func TestFormatEventDetailsForEmail(t *testing.T) {
	server := NewNotificationServer()
	start := time.Date(2026, time.January, 10, 14, 30, 0, 0, time.UTC)
	end := start.Add(75 * time.Minute)

	t.Run("timed event uses user timezone", func(t *testing.T) {
		loc, err := time.LoadLocation("Europe/Amsterdam")
		if err != nil {
			t.Fatalf("failed to load timezone: %v", err)
		}

		details, err := server.formatEventDetailsForEmail(EventData{
			Title:  "Project Sync",
			Start:  start,
			End:    end,
			AllDay: false,
		}, "Europe/Amsterdam", 90)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if details.EventDate != start.In(loc).Format("Monday, Jan 2") {
			t.Fatalf("expected EventDate to use user timezone, got %q", details.EventDate)
		}
		wantTime := start.In(loc).Format("3:04 PM") + " - " + end.In(loc).Format("3:04 PM")
		if details.EventTime != wantTime {
			t.Fatalf("expected EventTime %q, got %q", wantTime, details.EventTime)
		}
		if details.TimeUntilEvent != "1h 30m" {
			t.Fatalf("expected TimeUntilEvent %q, got %q", "1h 30m", details.TimeUntilEvent)
		}
		if details.ReminderText != "Your event starts in 1h 30m" {
			t.Fatalf("expected ReminderText to be preserved, got %q", details.ReminderText)
		}
		if details.Duration != "1h 15m" {
			t.Fatalf("expected Duration %q, got %q", "1h 15m", details.Duration)
		}
	})

	t.Run("all day event renders all day labels", func(t *testing.T) {
		details, err := server.formatEventDetailsForEmail(EventData{
			Title:  "Holiday",
			Start:  start,
			End:    end,
			AllDay: true,
		}, "", 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if details.EventTime != "All day" {
			t.Fatalf("expected all-day EventTime, got %q", details.EventTime)
		}
		if details.Duration != "All day" {
			t.Fatalf("expected all-day Duration, got %q", details.Duration)
		}
	})
}

func TestSenderDisplayAndFromAddress(t *testing.T) {
	t.Setenv("EMAIL_FROM_ADDRESS", "Notifications <no-reply@example.com>")
	server := NewNotificationServer()

	event := EventData{Title: `Quarterly <Review>@Team`}
	if got := sanitizeMailFragment(event.Title); got != "Quarterly Review Team" {
		t.Fatalf("expected sanitized title, got %q", got)
	}

	display := server.senderDisplayName(event, 90)
	if display != "Quarterly Review Team in 1 hour 30 minutes" {
		t.Fatalf("unexpected sender display name %q", display)
	}

	from, err := server.getFromAddress(event, 90)
	if err != nil {
		t.Fatalf("unexpected from-address error: %v", err)
	}

	parsed, err := mail.ParseAddress(from)
	if err != nil {
		t.Fatalf("expected valid mail address, got error: %v", err)
	}
	if parsed.Address != "no-reply@example.com" {
		t.Fatalf("expected sender address to be preserved, got %q", parsed.Address)
	}
	if parsed.Name != display {
		t.Fatalf("expected sender display name %q, got %q", display, parsed.Name)
	}
}

func TestResolveBaseFromAddress(t *testing.T) {
	tests := []struct {
		name      string
		emailFrom string
		fromEmail string
		want      string
		wantErr   string
	}{
		{name: "prefers EMAIL_FROM_ADDRESS", emailFrom: "Notifications <no-reply@example.com>", want: "no-reply@example.com"},
		{name: "falls back to FROM_EMAIL", fromEmail: "alerts@example.com", want: "alerts@example.com"},
		{name: "empty when unset", want: ""},
		{name: "rejects invalid address", emailFrom: "not-an-email", wantErr: "must contain a valid email address"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("EMAIL_FROM_ADDRESS", test.emailFrom)
			t.Setenv("FROM_EMAIL", test.fromEmail)

			got, err := resolveBaseFromAddress()
			if test.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantErr) {
					t.Fatalf("expected error containing %q, got %v", test.wantErr, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != test.want {
				t.Fatalf("expected %q, got %q", test.want, got)
			}
		})
	}
}

func TestBuildFrontendURL(t *testing.T) {
	t.Run("uses configured frontend base and query", func(t *testing.T) {
		t.Setenv("FRONTEND_URL", "https://solace.test/app/")
		t.Setenv("NEXT_PUBLIC_APP_URL", "")

		got := buildFrontendURL("/dashboard", map[string]string{
			"eventId": "evt-123",
			"view":    "week",
		})

		if !strings.HasPrefix(got, "https://solace.test/app/dashboard?") {
			t.Fatalf("expected configured base path, got %q", got)
		}
		if !strings.Contains(got, "eventId=evt-123") || !strings.Contains(got, "view=week") {
			t.Fatalf("expected query params in %q", got)
		}
	})

	t.Run("falls back to NEXT_PUBLIC_APP_URL then localhost", func(t *testing.T) {
		t.Setenv("FRONTEND_URL", "")
		t.Setenv("NEXT_PUBLIC_APP_URL", "https://app.solace.test")
		if got := buildFrontendURL("/settings", nil); got != "https://app.solace.test/settings" {
			t.Fatalf("unexpected NEXT_PUBLIC_APP_URL fallback %q", got)
		}

		t.Setenv("NEXT_PUBLIC_APP_URL", "")
		if got := buildFrontendURL("/privacy", nil); got != "http://localhost:3000/privacy" {
			t.Fatalf("unexpected localhost fallback %q", got)
		}
	})

	t.Run("invalid base falls back to concatenation", func(t *testing.T) {
		t.Setenv("FRONTEND_URL", "://bad")
		t.Setenv("NEXT_PUBLIC_APP_URL", "")

		if got := buildFrontendURL("/dashboard", nil); got != "://bad/dashboard" {
			t.Fatalf("unexpected invalid-base fallback %q", got)
		}
	})
}

func TestGenerateEmailContentAndSubject(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.test")
	server := NewNotificationServer()

	event := EventData{
		Title:         "Project Kickoff",
		Start:         time.Date(2026, time.May, 12, 9, 0, 0, 0, time.UTC),
		End:           time.Date(2026, time.May, 12, 10, 30, 0, 0, time.UTC),
		AllDay:        false,
		Location:      "Amsterdam",
		CalendarName:  "Work",
		Description:   "Discuss roadmap",
		CategoryName:  "Meetings",
		CategoryColor: "#ef4444",
	}
	user := UserData{Name: "Roan", Email: "roan@example.com", TimeZone: "UTC"}

	content, err := server.generateEmailContent(event, user, 30, "evt-1")
	if err != nil {
		t.Fatalf("unexpected generateEmailContent error: %v", err)
	}

	if !strings.Contains(content.HTML, "Project Kickoff") {
		t.Fatalf("expected HTML to contain event title, got %q", content.HTML)
	}
	if !strings.Contains(content.HTML, "https://app.solace.test/dashboard?eventId=evt-1") {
		t.Fatalf("expected HTML to contain event url, got %q", content.HTML)
	}
	if !strings.Contains(content.Text, "Open event: https://app.solace.test/dashboard?eventId=evt-1") {
		t.Fatalf("expected text email to contain event link, got %q", content.Text)
	}

	if subject := server.generateEmailSubject(event, 30); subject != "Project Kickoff in 30 minutes" {
		t.Fatalf("unexpected subject %q", subject)
	}
	if subject := server.generateEmailSubject(event, 0); subject != "Project Kickoff starting now" {
		t.Fatalf("unexpected immediate subject %q", subject)
	}
}

func TestGetStatusAndHandlers(t *testing.T) {
	server := NewNotificationServer()
	now := time.Date(2026, time.April, 18, 12, 0, 0, 0, time.UTC)
	server.isRunning = true
	server.processedCount = 7
	server.failedCount = 2
	server.lastProcessedAt = &now
	server.errors = []NotificationError{{Error: "boom", Timestamp: now}}

	status := server.GetStatus()
	if !status.IsRunning || status.ProcessedCount != 7 || status.FailedCount != 2 {
		t.Fatalf("unexpected status payload: %+v", status)
	}
	if status.PendingNotifications != 0 {
		t.Fatalf("expected no pending notifications without db, got %d", status.PendingNotifications)
	}

	t.Run("status handler returns JSON", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/status", nil)
		response := httptest.NewRecorder()

		server.statusHandler(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", response.Code)
		}
		var payload NotificationStatus
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("failed to decode status response: %v", err)
		}
		if payload.ProcessedCount != 7 || payload.FailedCount != 2 {
			t.Fatalf("unexpected status response: %+v", payload)
		}
	})

	t.Run("health handler reflects running state", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/health", nil)
		response := httptest.NewRecorder()

		server.healthHandler(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("expected healthy status code, got %d", response.Code)
		}
		var payload map[string]any
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("failed to decode health response: %v", err)
		}
		if payload["status"] != "healthy" {
			t.Fatalf("unexpected health payload: %+v", payload)
		}

		server.isRunning = false
		response = httptest.NewRecorder()
		server.healthHandler(response, request)
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected stopped status code, got %d", response.Code)
		}
	})
}

func TestSendEmailNotificationValidation(t *testing.T) {
	server := NewNotificationServer()

	err := server.sendEmailNotification(nil, EventData{Title: "Test"}, UserData{Email: "user@example.com"}, 15, "evt-1")
	if err == nil || !strings.Contains(err.Error(), "email service not configured") {
		t.Fatalf("expected resend configuration error, got %v", err)
	}

	server.resend = resend.NewClient("test-api-key")
	err = server.sendEmailNotification(nil, EventData{Title: "Test"}, UserData{}, 15, "evt-1")
	if err == nil || !strings.Contains(err.Error(), "user email is required") {
		t.Fatalf("expected missing email validation error, got %v", err)
	}
}