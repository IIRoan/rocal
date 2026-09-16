package jobs

import (
	"strings"
	"testing"
	"time"
)

func TestLoadReminderSQLReadsCiphertextOnly(t *testing.T) {
	if !strings.Contains(LoadReminderSQL, "'encrypted_display_title'") {
		t.Fatal("expected reminder load to read the encrypted title")
	}
	for _, column := range []string{"display_title,", "ce.title", "ce.location", "ce.description", "c.name", "ec.name"} {
		if strings.Contains(LoadReminderSQL, column) {
			t.Fatalf("reminder load must not read plaintext content (%s)", column)
		}
	}
}

func TestStartClockUsesUserTimezoneAndFormat(t *testing.T) {
	start := time.Date(2026, 9, 15, 13, 30, 0, 0, time.UTC)
	event := ReminderEvent{Start: start}
	if got := StartClock(event, ReminderUser{TimeZone: "Europe/Amsterdam", TimeFormat: "24h"}); got != "15:30" {
		t.Fatalf("24h clock = %q", got)
	}
	if got := StartClock(event, ReminderUser{TimeZone: "America/New_York", TimeFormat: "12h"}); got != "9:30 AM" {
		t.Fatalf("12h clock = %q", got)
	}
	if got := StartClock(event, ReminderUser{TimeZone: "Not/AZone"}); got != "13:30" {
		t.Fatalf("invalid timezone clock = %q", got)
	}
	if got := StartClock(ReminderEvent{Start: start, AllDay: true}, ReminderUser{}); got != "" {
		t.Fatalf("all-day clock = %q", got)
	}
}

func TestClaimPendingSQLHoldsLease(t *testing.T) {
	if !strings.Contains(ClaimPendingSQL, "available_at = NOW() + interval '2 minutes'") {
		t.Fatal("expected claim to bump available_at so overlapping ticks cannot double-send")
	}
	if !strings.Contains(ClaimPendingSQL, "j.attempts") {
		t.Fatal("expected claim to return attempts for backoff")
	}
	if !strings.Contains(ClaimPendingSQL, "FOR UPDATE SKIP LOCKED") {
		t.Fatal("expected claim to skip locked rows")
	}
}

func TestRetryDelayBacksOffThenCaps(t *testing.T) {
	if got := RetryDelay(1); got != 15*time.Second {
		t.Fatalf("attempt 1 delay = %s, want 15s", got)
	}
	if got := RetryDelay(2); got != 30*time.Second {
		t.Fatalf("attempt 2 delay = %s, want 30s", got)
	}
	if got := RetryDelay(4); got != 2*time.Minute {
		t.Fatalf("attempt 4 delay = %s, want 2m", got)
	}
	if got := RetryDelay(8); got != 15*time.Minute {
		t.Fatalf("attempt 8 delay = %s, want 15m cap", got)
	}
	if got := RetryDelay(20); got != 15*time.Minute {
		t.Fatalf("attempt 20 delay = %s, want 15m cap", got)
	}
}
