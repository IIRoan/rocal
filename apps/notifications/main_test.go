package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"notifications/internal/email"
	"notifications/internal/jobs"
	"notifications/internal/logger"
	"notifications/internal/push"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestServer(t *testing.T) *NotificationServer {
	t.Helper()
	server := NewNotificationServer()
	server.log = logger.New("test")
	return server
}

func TestNewNotificationServerDefaults(t *testing.T) {
	server := newTestServer(t)

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
	server := newTestServer(t)
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
	server := newTestServer(t)

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
	server := newTestServer(t)
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
	server := newTestServer(t)

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
	server := newTestServer(t)
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

	t.Run("all day event keeps the canonical local date", func(t *testing.T) {
		loc, err := time.LoadLocation("Europe/Amsterdam")
		if err != nil {
			t.Fatalf("failed to load timezone: %v", err)
		}

		localStart := time.Date(2026, time.January, 10, 0, 0, 0, 0, loc)
		localEnd := time.Date(2026, time.January, 10, 23, 59, 59, 0, loc)

		details, err := server.formatEventDetailsForEmail(EventData{
			Title:  "Holiday",
			Start:  localStart.UTC(),
			End:    localEnd.UTC(),
			AllDay: true,
		}, "Europe/Amsterdam", 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if details.EventDate != localStart.Format("Monday, Jan 2") {
			t.Fatalf("expected EventDate %q, got %q", localStart.Format("Monday, Jan 2"), details.EventDate)
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
	server := newTestServer(t)

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
		name         string
		emailFrom    string
		emailFromAlt string
		fromEmail    string
		want         string
		wantErr      string
	}{
		{name: "prefers EMAIL_FROM", emailFrom: "Solace <noreply@solace.onl>", want: "noreply@solace.onl"},
		{name: "falls back to EMAIL_FROM_ADDRESS", emailFromAlt: "Notifications <no-reply@example.com>", want: "no-reply@example.com"},
		{name: "falls back to FROM_EMAIL", fromEmail: "alerts@example.com", want: "alerts@example.com"},
		{name: "empty when unset", want: ""},
		{name: "rejects invalid address", emailFrom: "not-an-email", wantErr: "must contain a valid email address"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("EMAIL_FROM", test.emailFrom)
			t.Setenv("EMAIL_FROM_ADDRESS", test.emailFromAlt)
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
		if got := buildFrontendURL("/privacy", nil); got != "http://localhost/privacy" {
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
	server := newTestServer(t)

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
	if !strings.Contains(content.HTML, "https://app.solace.test/calendar?eventId=evt-1") {
		t.Fatalf("expected HTML to contain event url, got %q", content.HTML)
	}
	if !strings.Contains(content.Text, "Open event: https://app.solace.test/calendar?eventId=evt-1") {
		t.Fatalf("expected text email to contain event link, got %q", content.Text)
	}
	if !strings.Contains(content.Text, "Event ID: evt-1") {
		t.Fatalf("expected text email to contain event ID, got %q", content.Text)
	}

	if subject := server.generateEmailSubject(event, 30); subject != "Project Kickoff in 30 minutes" {
		t.Fatalf("unexpected subject %q", subject)
	}
	if subject := server.generateEmailSubject(event, 0); subject != "Project Kickoff starting now" {
		t.Fatalf("unexpected immediate subject %q", subject)
	}
}

func TestGenerateEmailContentAndSubjectForEncryptedEvent(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.test")
	t.Setenv("EMAIL_FROM_ADDRESS", "Notifications <no-reply@example.com>")
	server := newTestServer(t)

	event := EventData{
		Title:           "Private Planning",
		Start:           time.Date(2026, time.May, 12, 9, 0, 0, 0, time.UTC),
		End:             time.Date(2026, time.May, 12, 10, 30, 0, 0, time.UTC),
		AllDay:          false,
		EncryptionState: "encrypted",
		Location:        "Secret Room",
		CalendarName:    "Board",
		Description:     "Classified",
		CategoryName:    "Leadership",
	}
	user := UserData{Name: "Roan", Email: "roan@example.com", TimeZone: "UTC"}

	content, err := server.generateEmailContent(event, user, 30, "evt-1")
	if err != nil {
		t.Fatalf("unexpected generateEmailContent error: %v", err)
	}

	if !strings.Contains(content.HTML, "Private Planning") {
		t.Fatalf("expected HTML to contain reminder title, got %q", content.HTML)
	}
	if strings.Contains(content.HTML, "Secret Room") || strings.Contains(content.HTML, "Classified") || strings.Contains(content.HTML, "Board") {
		t.Fatalf("expected HTML to redact encrypted event details, got %q", content.HTML)
	}
	if strings.Contains(content.Text, "Secret Room") || strings.Contains(content.Text, "Classified") {
		t.Fatalf("expected text email to redact encrypted event details, got %q", content.Text)
	}

	if subject := server.generateEmailSubject(event, 30); subject != "Private Planning in 30 minutes" {
		t.Fatalf("unexpected encrypted subject %q", subject)
	}
	if display := server.senderDisplayName(event, 30); display != "Private Planning in 30 minutes" {
		t.Fatalf("unexpected encrypted sender display %q", display)
	}

	from, err := server.getFromAddress(event, 30)
	if err != nil {
		t.Fatalf("unexpected from-address error: %v", err)
	}
	parsed, err := mail.ParseAddress(from)
	if err != nil {
		t.Fatalf("expected valid mail address, got error: %v", err)
	}
	if parsed.Name != "Private Planning in 30 minutes" {
		t.Fatalf("expected reminder title in sender display name, got %q", parsed.Name)
	}
}

func TestGenerateEmailContentFallsBackWhenEncryptedTitleIsMissing(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.test")
	server := newTestServer(t)
	event := EventData{
		Title:           "",
		Start:           time.Date(2026, time.May, 12, 9, 0, 0, 0, time.UTC),
		End:             time.Date(2026, time.May, 12, 10, 30, 0, 0, time.UTC),
		EncryptionState: "encrypted",
		Location:        "Secret Room",
	}
	user := UserData{Name: "Roan", Email: "roan@example.com", TimeZone: "UTC"}

	content, err := server.generateEmailContent(event, user, 30, "evt-1")
	if err != nil {
		t.Fatalf("unexpected generateEmailContent error: %v", err)
	}
	if !strings.Contains(content.HTML, "Encrypted event") {
		t.Fatalf("expected fallback encrypted title, got %q", content.HTML)
	}
	if strings.Contains(content.HTML, "Secret Room") {
		t.Fatalf("expected location to stay redacted, got %q", content.HTML)
	}
	if subject := server.generateEmailSubject(event, 30); subject != "Encrypted event in 30 minutes" {
		t.Fatalf("unexpected fallback subject %q", subject)
	}
}

func TestReminderDisplayTitleIgnoresPlaceholder(t *testing.T) {
	server := newTestServer(t)
	event := EventData{
		Title:           "Encrypted event",
		EncryptionState: "encrypted",
	}
	if title := server.reminderDisplayTitle(event); title != "Encrypted event" {
		t.Fatalf("expected placeholder fallback, got %q", title)
	}
	if title := capturedReminderTitle("Encrypted event"); title != "" {
		t.Fatalf("expected captured title to ignore placeholder, got %q", title)
	}
	if title := capturedReminderTitle("Lunch with Sam"); title != "Lunch with Sam" {
		t.Fatalf("expected captured title, got %q", title)
	}
}

func TestGetStatusAndHandlers(t *testing.T) {
	server := newTestServer(t)
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
	server := newTestServer(t)

	err := server.sendEmailNotification(nil, EventData{Title: "Test"}, UserData{Email: "user@example.com"}, 15, "evt-1")
	if err == nil || !strings.Contains(err.Error(), "email service not configured") {
		t.Fatalf("expected email configuration error, got %v", err)
	}

	server.mailer = email.NewClient(email.Config{})
	err = server.sendEmailNotification(nil, EventData{Title: "Test"}, UserData{}, 15, "evt-1")
	if err == nil || !strings.Contains(err.Error(), "user email is required") {
		t.Fatalf("expected missing email validation error, got %v", err)
	}
}

func TestDispatchSkipsAfterMaxAttempts(t *testing.T) {
	server := newTestServer(t)

	err := server.dispatchJob(context.Background(), jobs.Job{
		ID:       "job-1",
		Channel:  "push",
		Kind:     "new_mail",
		Attempts: jobs.MaxAttempts,
	})
	if !errors.Is(err, errJobSkipped) {
		t.Fatalf("expected skip after max attempts, got %v", err)
	}
}

func TestDispatchSkipsUnconfiguredChannelsIndependently(t *testing.T) {
	server := newTestServer(t)

	err := server.dispatchJob(context.Background(), jobs.Job{ID: "email-1", Channel: "email"})
	if !errors.Is(err, errJobSkipped) {
		t.Fatalf("expected email job to skip without a mailer, got %v", err)
	}

	err = server.dispatchJob(context.Background(), jobs.Job{ID: "push-1", Channel: "push"})
	if !errors.Is(err, errJobSkipped) {
		t.Fatalf("expected push job to skip without APNs, got %v", err)
	}
}

func TestSanitizeMailFragment(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "removes angle brackets", input: `Hello <World>`, want: "Hello World"},
		{name: "removes quotes", input: `Say "hello" now`, want: "Say hello now"},
		{name: "removes at sign", input: `user@domain.com`, want: "user domain.com"},
		{name: "removes slashes", input: `path/to\\file`, want: "path to file"},
		{name: "removes braces", input: `{key}: [value]`, want: "key value"},
		{name: "removes semicolons and pipes", input: `a; b | c`, want: "a b c"},
		{name: "collapses whitespace", input: `  lots   of    space  `, want: "lots of space"},
		{name: "empty input", input: "", want: ""},
		{name: "all special chars", input: `<>()[]{}@/\|:;,"'`, want: ""},
		{name: "preserves normal text", input: "Team standup meeting", want: "Team standup meeting"},
		{name: "preserves hyphens and dots", input: "Q2-planning v2.0", want: "Q2-planning v2.0"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := sanitizeMailFragment(test.input); got != test.want {
				t.Fatalf("sanitizeMailFragment(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestNullableString(t *testing.T) {
	if got := nullableString(sql.NullString{String: "hello", Valid: true}); got != "hello" {
		t.Fatalf("expected 'hello', got %q", got)
	}
	if got := nullableString(sql.NullString{String: "ghost", Valid: false}); got != "" {
		t.Fatalf("expected empty for invalid NullString, got %q", got)
	}
	if got := nullableString(sql.NullString{}); got != "" {
		t.Fatalf("expected empty for zero NullString, got %q", got)
	}
}

func TestGetPort(t *testing.T) {
	t.Run("defaults to 4002", func(t *testing.T) {
		t.Setenv("PORT", "")
		if got := getPort(); got != "4002" {
			t.Fatalf("expected default port 4002, got %q", got)
		}
	})

	t.Run("uses PORT env var", func(t *testing.T) {
		t.Setenv("PORT", "9090")
		if got := getPort(); got != "9090" {
			t.Fatalf("expected port 9090, got %q", got)
		}
	})
}

func TestLoadAPNsConfig(t *testing.T) {
	t.Run("reports missing vars", func(t *testing.T) {
		t.Setenv("APNS_KEY_ID", "")
		t.Setenv("APNS_TEAM_ID", "")
		t.Setenv("APNS_AUTH_KEY", "")
		t.Setenv("APNS_AUTH_KEY_FILE", "")
		_, missing, err := loadAPNsConfig()
		if err != nil {
			t.Fatal(err)
		}
		if len(missing) != 3 {
			t.Fatalf("expected 3 missing vars, got %v", missing)
		}
	})

	t.Run("loads PEM from APNS_AUTH_KEY_FILE", func(t *testing.T) {
		pemBytes, err := push.GenerateTestKeyPEM()
		if err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(t.TempDir(), "AuthKey.p8")
		if err := os.WriteFile(path, pemBytes, 0o600); err != nil {
			t.Fatal(err)
		}
		t.Setenv("APNS_KEY_ID", "KEYID12345")
		t.Setenv("APNS_TEAM_ID", "TEAMID1234")
		t.Setenv("APNS_AUTH_KEY", "")
		t.Setenv("APNS_AUTH_KEY_FILE", path)

		cfg, missing, err := loadAPNsConfig()
		if err != nil {
			t.Fatal(err)
		}
		if len(missing) != 0 {
			t.Fatalf("expected complete config, missing %v", missing)
		}
		if _, err := push.ParseAuthKey(cfg.pem); err != nil {
			t.Fatalf("file PEM should parse: %v", err)
		}
	})

	t.Run("wraps bare key material as PEM", func(t *testing.T) {
		got := string(normalizeAPNsPEM([]byte("  abcdef  ")))
		if !strings.Contains(got, "BEGIN PRIVATE KEY") || !strings.Contains(got, "abcdef") {
			t.Fatalf("expected wrapped PEM, got %q", got)
		}
	})
}

func TestSenderDisplayNameEdgeCases(t *testing.T) {
	server := newTestServer(t)

	t.Run("empty title falls back to reminder", func(t *testing.T) {
		got := server.senderDisplayName(EventData{Title: ""}, 15)
		if got != "reminder in 15 minutes" {
			t.Fatalf("expected fallback display name, got %q", got)
		}
	})

	t.Run("all-special-chars title falls back to reminder", func(t *testing.T) {
		got := server.senderDisplayName(EventData{Title: "<>@:;"}, 60)
		if got != "reminder in 1 hour" {
			t.Fatalf("expected fallback display name, got %q", got)
		}
	})

	t.Run("starting now variant", func(t *testing.T) {
		got := server.senderDisplayName(EventData{Title: "Standup"}, 0)
		if got != "Standup starting now" {
			t.Fatalf("expected starting now display, got %q", got)
		}
	})

	t.Run("negative minutes treated as starting now", func(t *testing.T) {
		got := server.senderDisplayName(EventData{Title: "Late Event"}, -5)
		if got != "Late Event starting now" {
			t.Fatalf("expected starting now for negative minutes, got %q", got)
		}
	})
}

func TestGenerateEmailSubjectEdgeCases(t *testing.T) {
	server := newTestServer(t)

	tests := []struct {
		name    string
		title   string
		minutes int
		want    string
	}{
		{name: "1 minute", title: "Sync", minutes: 1, want: "Sync in 1 minute"},
		{name: "15 minutes", title: "Standup", minutes: 15, want: "Standup in 15 minutes"},
		{name: "exactly 1 hour", title: "Review", minutes: 60, want: "Review in 1 hour"},
		{name: "2 hours", title: "Workshop", minutes: 120, want: "Workshop in 2 hours"},
		{name: "mixed hours and minutes", title: "Planning", minutes: 150, want: "Planning in 2 hours 30 minutes"},
		{name: "starting now", title: "Urgent", minutes: 0, want: "Urgent starting now"},
		{name: "negative", title: "Overdue", minutes: -1, want: "Overdue starting now"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := server.generateEmailSubject(EventData{Title: test.title}, test.minutes)
			if got != test.want {
				t.Fatalf("generateEmailSubject(%q, %d) = %q, want %q", test.title, test.minutes, got, test.want)
			}
		})
	}
}

func TestFormatReminderSummaryEdgeCases(t *testing.T) {
	server := newTestServer(t)

	tests := []struct {
		minutes int
		want    string
	}{
		{minutes: -10, want: "starting now"},
		{minutes: 0, want: "starting now"},
		{minutes: 1, want: "1 minute"},
		{minutes: 59, want: "59 minutes"},
		{minutes: 60, want: "1 hour"},
		{minutes: 61, want: "1 hour 1 minute"},
		{minutes: 120, want: "2 hours"},
		{minutes: 1440, want: "24 hours"},
		{minutes: 1441, want: "24 hours 1 minute"},
	}

	for _, test := range tests {
		t.Run(test.want, func(t *testing.T) {
			if got := server.formatReminderSummary(test.minutes); got != test.want {
				t.Fatalf("formatReminderSummary(%d) = %q, want %q", test.minutes, got, test.want)
			}
		})
	}
}

func TestCalculateEventDurationEdgeCases(t *testing.T) {
	server := newTestServer(t)
	start := time.Date(2026, time.March, 15, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		end    time.Time
		allDay bool
		want   string
	}{
		{name: "exactly 1 hour", end: start.Add(1 * time.Hour), want: "1h"},
		{name: "exactly 1 minute", end: start.Add(1 * time.Minute), want: "1m"},
		{name: "end before start", end: start.Add(-30 * time.Minute), want: ""},
		{name: "same time", end: start, want: ""},
		{name: "multi-hour all day", end: start.Add(24 * time.Hour), allDay: true, want: "All day"},
		{name: "5 hours 15 minutes", end: start.Add(5*time.Hour + 15*time.Minute), want: "5h 15m"},
		{name: "very long event", end: start.Add(48 * time.Hour), want: "48h"},
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

func TestFormatEventDetailsInvalidTimezone(t *testing.T) {
	server := newTestServer(t)
	start := time.Date(2026, time.June, 1, 12, 0, 0, 0, time.UTC)
	end := start.Add(1 * time.Hour)

	details, err := server.formatEventDetailsForEmail(EventData{
		Title:  "Meeting",
		Start:  start,
		End:    end,
		AllDay: false,
	}, "Invalid/Timezone", 30)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if details.EventDate != start.Format("Monday, Jan 2") {
		t.Fatalf("expected UTC fallback date, got %q", details.EventDate)
	}
	if details.EventTime != "12:00 PM - 1:00 PM" {
		t.Fatalf("expected UTC time, got %q", details.EventTime)
	}
}

func TestFormatEventDetailsEmptyTimezone(t *testing.T) {
	server := newTestServer(t)
	start := time.Date(2026, time.June, 1, 8, 0, 0, 0, time.UTC)
	end := start.Add(30 * time.Minute)

	details, err := server.formatEventDetailsForEmail(EventData{
		Title: "Standup",
		Start: start,
		End:   end,
	}, "", 15)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if details.EventTime != "8:00 AM - 8:30 AM" {
		t.Fatalf("expected UTC time with empty tz, got %q", details.EventTime)
	}
}

func TestFormatEventDetailsSinglePointTime(t *testing.T) {
	server := newTestServer(t)
	start := time.Date(2026, time.March, 1, 15, 0, 0, 0, time.UTC)

	details, err := server.formatEventDetailsForEmail(EventData{
		Title: "Deadline",
		Start: start,
		End:   start,
	}, "UTC", 10)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if details.EventTime != "3:00 PM" {
		t.Fatalf("expected single time point, got %q", details.EventTime)
	}
	if details.Duration != "" {
		t.Fatalf("expected empty duration for zero-length event, got %q", details.Duration)
	}
}

func TestGenerateEmailContentIncludesLogoUrl(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://solace.onl")
	server := newTestServer(t)

	event := EventData{
		Title: "Logo Check",
		Start: time.Date(2026, time.May, 1, 10, 0, 0, 0, time.UTC),
		End:   time.Date(2026, time.May, 1, 11, 0, 0, 0, time.UTC),
	}
	user := UserData{Name: "Tester", Email: "test@example.com", TimeZone: "UTC"}

	content, err := server.generateEmailContent(event, user, 15, "evt-logo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(content.HTML, "https://solace.onl/favicon-192x192.png") {
		t.Fatal("expected HTML to contain logo URL")
	}
}

func TestGenerateEmailContentConditionalFields(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.test")
	server := newTestServer(t)

	t.Run("omits optional fields when empty", func(t *testing.T) {
		event := EventData{
			Title: "Minimal Event",
			Start: time.Date(2026, time.April, 1, 9, 0, 0, 0, time.UTC),
			End:   time.Date(2026, time.April, 1, 10, 0, 0, 0, time.UTC),
		}
		user := UserData{Name: "User", Email: "u@example.com", TimeZone: "UTC"}

		content, err := server.generateEmailContent(event, user, 30, "evt-min")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if strings.Contains(content.HTML, "Location") {
			t.Fatal("expected HTML to not contain Location when empty")
		}
		if strings.Contains(content.Text, "Location:") {
			t.Fatal("expected plain text to not contain Location when empty")
		}
	})

	t.Run("includes all fields when provided", func(t *testing.T) {
		event := EventData{
			Title:        "Full Event",
			Start:        time.Date(2026, time.April, 1, 9, 0, 0, 0, time.UTC),
			End:          time.Date(2026, time.April, 1, 10, 30, 0, 0, time.UTC),
			Location:     "Conference Room B",
			CalendarName: "Engineering",
		}
		user := UserData{Name: "User", Email: "u@example.com", TimeZone: "UTC"}

		content, err := server.generateEmailContent(event, user, 60, "evt-full")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		for _, want := range []string{"Conference Room B", "Engineering", "1h 30m"} {
			if !strings.Contains(content.HTML, want) {
				t.Fatalf("expected HTML to contain %q", want)
			}
		}
		if !strings.Contains(content.Text, "Location: Conference Room B") {
			t.Fatal("expected plain text to contain location")
		}
		if !strings.Contains(content.Text, "Duration: 1h 30m") {
			t.Fatal("expected plain text to contain duration")
		}
	})
}

func TestGetFromAddressErrors(t *testing.T) {
	server := newTestServer(t)
	event := EventData{Title: "Test"}

	t.Run("missing from address", func(t *testing.T) {
		t.Setenv("EMAIL_FROM", "")
		t.Setenv("EMAIL_FROM_ADDRESS", "")
		t.Setenv("FROM_EMAIL", "")

		_, err := server.getFromAddress(event, 15)
		if err == nil || !strings.Contains(err.Error(), "not configured") {
			t.Fatalf("expected not-configured error, got %v", err)
		}
	})

	t.Run("invalid from address", func(t *testing.T) {
		t.Setenv("EMAIL_FROM", "not-an-email")
		t.Setenv("EMAIL_FROM_ADDRESS", "")
		t.Setenv("FROM_EMAIL", "")

		_, err := server.getFromAddress(event, 15)
		if err == nil {
			t.Fatal("expected error for invalid email address")
		}
	})

	t.Run("valid from address includes display name", func(t *testing.T) {
		t.Setenv("EMAIL_FROM", "noreply@solace.onl")
		t.Setenv("EMAIL_FROM_ADDRESS", "")
		t.Setenv("FROM_EMAIL", "")

		from, err := server.getFromAddress(event, 30)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		parsed, err := mail.ParseAddress(from)
		if err != nil {
			t.Fatalf("expected valid address, got error: %v", err)
		}
		if parsed.Address != "noreply@solace.onl" {
			t.Fatalf("expected noreply@solace.onl, got %q", parsed.Address)
		}
		if !strings.Contains(parsed.Name, "Test") {
			t.Fatalf("expected display name containing event title, got %q", parsed.Name)
		}
	})
}

func TestAddErrorConcurrency(t *testing.T) {
	server := newTestServer(t)
	server.maxErrors = 10

	for i := 0; i < 25; i++ {
		server.addError("error")
	}

	if len(server.errors) != 10 {
		t.Fatalf("expected 10 errors after overflow, got %d", len(server.errors))
	}
}

func TestHealthHandlerAcceptsAnyMethod(t *testing.T) {
	server := newTestServer(t)
	server.isRunning = true

	request := httptest.NewRequest(http.MethodPost, "/health", nil)
	response := httptest.NewRecorder()
	server.healthHandler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for POST health, got %d", response.Code)
	}
}

func TestStatusHandlerWithNoErrors(t *testing.T) {
	server := newTestServer(t)
	server.isRunning = true

	request := httptest.NewRequest(http.MethodGet, "/status", nil)
	response := httptest.NewRecorder()
	server.statusHandler(response, request)

	var payload NotificationStatus
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode status: %v", err)
	}
	if len(payload.Errors) != 0 {
		t.Fatalf("expected no errors, got %d", len(payload.Errors))
	}
	if payload.ProcessedCount != 0 || payload.FailedCount != 0 {
		t.Fatalf("expected zero counts, got processed=%d failed=%d", payload.ProcessedCount, payload.FailedCount)
	}
}

func TestSendTestEmailRequiresRecipient(t *testing.T) {
	server := newTestServer(t)

	err := server.sendTestEmail("")
	if err == nil || !strings.Contains(err.Error(), "test recipient is required") {
		t.Fatalf("expected recipient required error, got %v", err)
	}

	err = server.sendTestEmail("   ")
	if err == nil || !strings.Contains(err.Error(), "test recipient is required") {
		t.Fatalf("expected recipient required error for whitespace, got %v", err)
	}
}

func TestSendTestPushRequiresRecipient(t *testing.T) {
	server := newTestServer(t)

	err := server.sendTestPush("")
	if err == nil || !strings.Contains(err.Error(), "test recipient is required") {
		t.Fatalf("expected recipient required error, got %v", err)
	}
}

func TestSendTestPushRequiresPusher(t *testing.T) {
	t.Setenv("APNS_KEY_ID", "")
	t.Setenv("APNS_TEAM_ID", "")
	t.Setenv("APNS_AUTH_KEY", "")
	t.Setenv("APNS_AUTH_KEY_FILE", "")
	server := newTestServer(t)

	err := server.sendTestPush("test@example.com")
	if err == nil || !strings.Contains(err.Error(), "push service not configured") {
		t.Fatalf("expected push service error, got %v", err)
	}
}

func TestSendTestPushRequiresDatabase(t *testing.T) {
	pem, err := push.GenerateTestKeyPEM()
	if err != nil {
		t.Fatalf("generate test APNs key: %v", err)
	}
	t.Setenv("APNS_KEY_ID", "TESTID12")
	t.Setenv("APNS_TEAM_ID", "TEAMID12")
	t.Setenv("APNS_AUTH_KEY", string(pem))
	t.Setenv("APNS_AUTH_KEY_FILE", "")
	t.Setenv("DATABASE_URL", "")
	server := newTestServer(t)

	err = server.sendTestPush("test@example.com")
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("expected DATABASE_URL error, got %v", err)
	}
}

func TestSendTestEmailRequiresMailer(t *testing.T) {
	t.Setenv("STALWART_JMAP_USERNAME", "")
	t.Setenv("STALWART_JMAP_PASSWORD", "")
	t.Setenv("EMAIL_FROM", "")
	t.Setenv("FROM_EMAIL", "")
	t.Setenv("EMAIL_FROM_ADDRESS", "")
	server := newTestServer(t)

	err := server.sendTestEmail("test@example.com")
	if err == nil || !strings.Contains(err.Error(), "email service not configured") {
		t.Fatalf("expected email service error, got %v", err)
	}
}

func TestStartRequiresDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	server := newTestServer(t)

	err := server.Start()
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("expected DATABASE_URL error on Start, got %v", err)
	}
}

func TestStopIdempotent(t *testing.T) {
	server := newTestServer(t)

	server.Stop()
	server.Stop()

	if server.isRunning {
		t.Fatal("expected server to remain stopped")
	}
}

func TestFormatReminderTextNegativeMinutes(t *testing.T) {
	server := newTestServer(t)

	if got := server.formatReminderText(-5); got != "Your event is starting now" {
		t.Fatalf("expected starting now for negative minutes, got %q", got)
	}
}

func TestBuildFrontendURLTrailingSlashHandling(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.onl/")
	t.Setenv("NEXT_PUBLIC_APP_URL", "")

	got := buildFrontendURL("/dashboard", nil)
	if got != "https://app.solace.onl/dashboard" {
		t.Fatalf("expected trailing slash to be normalized, got %q", got)
	}
}

func TestBuildFrontendURLEmptyQuery(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.solace.onl")
	t.Setenv("NEXT_PUBLIC_APP_URL", "")

	got := buildFrontendURL("/settings", map[string]string{})
	if got != "https://app.solace.onl/settings" {
		t.Fatalf("expected clean URL with empty query map, got %q", got)
	}
}

func TestDiscoverEnvFilesFindsBackendEnv(t *testing.T) {
	root := t.TempDir()
	backendDir := filepath.Join(root, "apps", "backend")
	notifDir := filepath.Join(root, "apps", "notifications")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(notifDir, 0o755); err != nil {
		t.Fatal(err)
	}
	backendEnv := filepath.Join(backendDir, ".env")
	if err := os.WriteFile(backendEnv, []byte("DATABASE_URL=postgres://local\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Chdir(notifDir)
	files := discoverEnvFiles()
	want, err := filepath.Abs(backendEnv)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0] != want {
		t.Fatalf("expected [%s], got %v", want, files)
	}
}

func TestDiscoverEnvFilesPrefersLocalOverBackend(t *testing.T) {
	root := t.TempDir()
	backendDir := filepath.Join(root, "apps", "backend")
	notifDir := filepath.Join(root, "apps", "notifications")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(notifDir, 0o755); err != nil {
		t.Fatal(err)
	}
	localEnv := filepath.Join(notifDir, ".env")
	backendEnv := filepath.Join(backendDir, ".env")
	if err := os.WriteFile(localEnv, []byte("DATABASE_URL=local\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(backendEnv, []byte("DATABASE_URL=backend\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Chdir(notifDir)
	files := discoverEnvFiles()
	wantLocal, err := filepath.Abs(localEnv)
	if err != nil {
		t.Fatal(err)
	}
	wantBackend, err := filepath.Abs(backendEnv)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 2 || files[0] != wantLocal {
		t.Fatalf("expected local .env first, got %v", files)
	}
	foundBackend := false
	for _, file := range files[1:] {
		if file == wantBackend {
			foundBackend = true
			break
		}
	}
	if !foundBackend {
		t.Fatalf("expected backend .env as fallback, got %v", files)
	}
}

func TestApplyEnvFileSkipsBackendPort(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "")

	dir := filepath.Join(t.TempDir(), "backend")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("PORT=4001\nDATABASE_URL=postgres://from-backend\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := applyEnvFile(path, envSkipKeys(path)); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("PORT"); got != "" {
		t.Fatalf("expected backend PORT to be ignored, got %q", got)
	}
	if got := getPort(); got != "4002" {
		t.Fatalf("expected default 4002 after skipping backend PORT, got %q", got)
	}
	if got := os.Getenv("DATABASE_URL"); got != "postgres://from-backend" {
		t.Fatalf("expected DATABASE_URL from backend env, got %q", got)
	}
}
