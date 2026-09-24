package schedule

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

type Settings struct {
	EmailNotifications bool
	PushNotifications  bool
}

type DueSchedule struct {
	ID            string
	EventID       string
	UserID        string
	MinutesBefore int
	Settings      Settings
	HasPushDevice bool
	// MailsToOwnMailbox is true when the account email is the user's own Solace mailbox.
	MailsToOwnMailbox bool
}

func ClaimDue(ctx context.Context, db *sql.DB, now time.Time) ([]DueSchedule, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, claimDueSQL, now.Truncate(time.Minute))
	if err != nil {
		return nil, fmt.Errorf("failed to query due notifications: %w", err)
	}
	defer rows.Close()

	var due []DueSchedule
	for rows.Next() {
		var item DueSchedule
		if err := rows.Scan(
			&item.ID,
			&item.EventID,
			&item.UserID,
			&item.MinutesBefore,
			&item.Settings.EmailNotifications,
			&item.Settings.PushNotifications,
			&item.HasPushDevice,
			&item.MailsToOwnMailbox,
		); err != nil {
			return nil, fmt.Errorf("failed to scan due notification: %w", err)
		}
		due = append(due, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, item := range due {
		if _, err := tx.ExecContext(ctx, `
			UPDATE event_notification
			SET is_sent = TRUE, updated_at = NOW()
			WHERE id = $1 AND is_sent = FALSE
		`, item.ID); err != nil {
			return nil, fmt.Errorf("failed to claim notification schedule: %w", err)
		}
		if err := insertJobs(ctx, tx, item); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return due, nil
}

const claimDueSQL = `
		SELECT
			en.id,
			en.event_id,
			ce.user_id,
			en.minutes_before,
			COALESCE(us."emailNotifications", TRUE),
			COALESCE(us.push_notifications, TRUE),
			EXISTS (
				SELECT 1 FROM push_device pd
				WHERE pd.user_id = ce.user_id AND pd.is_enabled = TRUE
			),
			EXISTS (
				SELECT 1 FROM mail_directory_entry mde
				WHERE mde.user_id = ce.user_id AND LOWER(mde.email) = LOWER(u.email)
			)
		FROM event_notification en
		INNER JOIN calendar_event ce ON ce.id = en.event_id
		INNER JOIN "user" u ON u.id = ce.user_id
		LEFT JOIN user_settings us ON us.user_id = ce.user_id
		WHERE en.notification_time <= $1
		  AND en.is_enabled = TRUE
		  AND en.is_sent = FALSE
		ORDER BY en.notification_time ASC
		LIMIT 50
		FOR UPDATE OF en SKIP LOCKED
	`

func newID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}

// emailDeferredToPush: reminder mail into the user's own Solace inbox would only duplicate the push on the same device.
func emailDeferredToPush(item DueSchedule) bool {
	return item.Settings.EmailNotifications && item.Settings.PushNotifications && item.HasPushDevice && item.MailsToOwnMailbox
}

func ChannelsFor(item DueSchedule) []string {
	var channels []string
	if item.Settings.EmailNotifications && !emailDeferredToPush(item) {
		channels = append(channels, "email")
	}
	if item.Settings.PushNotifications && item.HasPushDevice {
		channels = append(channels, "push")
	}
	return channels
}

// reminderJobPayload holds opaque refs only; the encrypted title is read at push time.
func reminderJobPayload(item DueSchedule, channel string) map[string]any {
	payload := map[string]any{
		"kind":          "event_reminder",
		"eventId":       item.EventID,
		"minutesBefore": item.MinutesBefore,
	}
	if channel == "push" && emailDeferredToPush(item) {
		payload["emailFallback"] = true
	}
	return payload
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertJob(ctx context.Context, db execer, item DueSchedule, channel string) error {
	payload, err := json.Marshal(reminderJobPayload(item, channel))
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, insertJobSQL, newID(), item.UserID, "event_reminder", channel, item.EventID, payload)
	return err
}

func insertJobs(ctx context.Context, tx *sql.Tx, item DueSchedule) error {
	for _, channel := range ChannelsFor(item) {
		if err := insertJob(ctx, tx, item, channel); err != nil {
			return err
		}
	}
	return nil
}

// QueueEmailFallback queues the reminder email that was deferred to a push job that ended skipped.
func QueueEmailFallback(ctx context.Context, db execer, userID, eventID string, minutesBefore int) error {
	return insertJob(ctx, db, DueSchedule{UserID: userID, EventID: eventID, MinutesBefore: minutesBefore}, "email")
}

const insertJobSQL = `
	INSERT INTO notification_job (
		id, user_id, kind, channel, event_id, payload, status, attempts, available_at, created_at, updated_at
	) VALUES (
		$1, $2, $3, $4, $5, $6::jsonb, 'pending', 0, NOW(), NOW(), NOW()
	)
`
