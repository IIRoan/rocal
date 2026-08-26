package jobs

import (
	"strings"
	"testing"
	"time"
)

func TestLoadReminderSQLUsesDisplayTitle(t *testing.T) {
	if !strings.Contains(LoadReminderSQL, "en.display_title") {
		t.Fatal("expected reminder load to prefer event_notification.display_title")
	}
	if !strings.Contains(LoadReminderSQL, "Encrypted event") {
		t.Fatal("expected reminder load to ignore the encrypted placeholder title")
	}
	if !strings.Contains(LoadReminderSQL, "ce.title") {
		t.Fatal("expected reminder load to fall back to calendar_event.title")
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
