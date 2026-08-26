package schedule

import (
	"strings"
	"testing"
)

func TestChannelsForHonorsSettingsAndDevices(t *testing.T) {
	item := DueSchedule{
		Settings: Settings{
			EmailNotifications: true,
			PushNotifications:  true,
		},
		HasPushDevice: true,
	}
	got := ChannelsFor(item)
	if len(got) != 2 || got[0] != "email" || got[1] != "push" {
		t.Fatalf("expected email and push, got %v", got)
	}

	item.Settings.EmailNotifications = false
	got = ChannelsFor(item)
	if len(got) != 1 || got[0] != "push" {
		t.Fatalf("expected push only, got %v", got)
	}

	item.HasPushDevice = false
	got = ChannelsFor(item)
	if len(got) != 0 {
		t.Fatalf("expected no channels without a device, got %v", got)
	}

	item.Settings.EmailNotifications = true
	got = ChannelsFor(item)
	if len(got) != 1 || got[0] != "email" {
		t.Fatalf("expected email only, got %v", got)
	}
}

func TestClaimDueSQLUsesPrismaColumnNames(t *testing.T) {
	if !strings.Contains(claimDueSQL, `us."emailNotifications"`) {
		t.Fatal(`expected quoted Prisma column "emailNotifications" (unmapped camelCase)`)
	}
	if strings.Contains(claimDueSQL, "email_notifications") {
		t.Fatal("email_notifications is not a real column; Prisma stored emailNotifications")
	}
	if !strings.Contains(claimDueSQL, "us.push_notifications") {
		t.Fatal("expected mapped push_notifications column")
	}
	if !strings.Contains(claimDueSQL, "en.display_title") {
		t.Fatal("expected claim query to load reminder display_title")
	}
}

func TestReminderJobPayloadIncludesTitle(t *testing.T) {
	payload := reminderJobPayload(DueSchedule{
		EventID:       "evt-1",
		MinutesBefore: 15,
		DisplayTitle:  "  Lunch with Sam  ",
	})
	if payload["title"] != "Lunch with Sam" {
		t.Fatalf("expected trimmed title, got %#v", payload["title"])
	}
	if _, ok := payload["subject"]; ok {
		t.Fatal("event reminder payload should not include subject")
	}
}

func TestReminderJobPayloadOmitsPlaceholderTitle(t *testing.T) {
	payload := reminderJobPayload(DueSchedule{
		EventID:       "evt-1",
		MinutesBefore: 15,
		DisplayTitle:  "Encrypted event",
	})
	if _, ok := payload["title"]; ok {
		t.Fatalf("expected placeholder title to be omitted, got %#v", payload["title"])
	}
}
