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

func TestChannelsForSkipsEmailToOwnMailboxWhenPushIsDelivered(t *testing.T) {
	item := DueSchedule{
		Settings: Settings{
			EmailNotifications: true,
			PushNotifications:  true,
		},
		HasPushDevice:     true,
		MailsToOwnMailbox: true,
	}
	got := ChannelsFor(item)
	if len(got) != 1 || got[0] != "push" {
		t.Fatalf("expected push only for own-mailbox users with a device, got %v", got)
	}

	item.HasPushDevice = false
	got = ChannelsFor(item)
	if len(got) != 1 || got[0] != "email" {
		t.Fatalf("expected email fallback without a device, got %v", got)
	}

	item.HasPushDevice = true
	item.Settings.PushNotifications = false
	got = ChannelsFor(item)
	if len(got) != 1 || got[0] != "email" {
		t.Fatalf("expected email fallback when app notifications are off, got %v", got)
	}

	item.Settings.EmailNotifications = false
	got = ChannelsFor(item)
	if len(got) != 0 {
		t.Fatalf("expected no channels when both are off, got %v", got)
	}
}

func TestChannelsForSendsExactlyOneReminderToOwnMailboxUsers(t *testing.T) {
	for _, email := range []bool{false, true} {
		for _, pushOn := range []bool{false, true} {
			for _, device := range []bool{false, true} {
				for _, ownMailbox := range []bool{false, true} {
					item := DueSchedule{
						Settings:          Settings{EmailNotifications: email, PushNotifications: pushOn},
						HasPushDevice:     device,
						MailsToOwnMailbox: ownMailbox,
					}
					sendsPush := pushOn && device
					var want []string
					if email && !(sendsPush && ownMailbox) {
						want = append(want, "email")
					}
					if sendsPush {
						want = append(want, "push")
					}

					got := ChannelsFor(item)
					if strings.Join(got, ",") != strings.Join(want, ",") {
						t.Fatalf("%+v: expected %v, got %v", item, want, got)
					}
					if ownMailbox && len(got) > 1 {
						t.Fatalf("%+v: own-mailbox users must never get both email and push, got %v", item, got)
					}
					if (email || sendsPush) && len(got) == 0 {
						t.Fatalf("%+v: an enabled channel must still deliver the reminder", item)
					}
				}
			}
		}
	}
}

func TestClaimDueSQLChecksOwnMailboxByAccountEmail(t *testing.T) {
	for _, fragment := range []string{
		"FROM mail_directory_entry mde",
		"mde.user_id = ce.user_id",
		"LOWER(mde.email) = LOWER(u.email)",
		`INNER JOIN "user" u ON u.id = ce.user_id`,
	} {
		if !strings.Contains(claimDueSQL, fragment) {
			t.Fatalf("expected claim query to contain %q", fragment)
		}
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
	if strings.Contains(claimDueSQL, "display_title") {
		t.Fatal("claim query must not read reminder titles")
	}
}

func TestReminderJobPayloadHasOpaqueRefsOnly(t *testing.T) {
	for _, channel := range []string{"email", "push"} {
		payload := reminderJobPayload(DueSchedule{
			EventID:       "evt-1",
			MinutesBefore: 15,
		}, channel)
		if len(payload) != 3 || payload["eventId"] != "evt-1" || payload["minutesBefore"] != 15 || payload["kind"] != "event_reminder" {
			t.Fatalf("unexpected %s payload %#v", channel, payload)
		}
	}
}

func TestReminderJobPayloadFlagsEmailFallbackOnlyOnDeferringPush(t *testing.T) {
	item := DueSchedule{
		Settings:          Settings{EmailNotifications: true, PushNotifications: true},
		HasPushDevice:     true,
		MailsToOwnMailbox: true,
	}
	if reminderJobPayload(item, "push")["emailFallback"] != true {
		t.Fatal("expected the push that replaces the email to carry the fallback flag")
	}
	item.MailsToOwnMailbox = false
	if _, ok := reminderJobPayload(item, "push")["emailFallback"]; ok {
		t.Fatal("email is queued alongside push, so no fallback is needed")
	}
	item.MailsToOwnMailbox = true
	item.Settings.EmailNotifications = false
	if _, ok := reminderJobPayload(item, "push")["emailFallback"]; ok {
		t.Fatal("email notifications are off, so there is nothing to fall back to")
	}
}
