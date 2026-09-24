package jobs

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"notifications/internal/privacy"
)

const MaxAttempts = 8

type Job struct {
	ID            string
	UserID        string
	Kind          string
	Channel       string
	EventID       sql.NullString
	Payload       privacy.Payload
	RawPayload    []byte
	MinutesBefore int
	InboundCount  int
	Attempts      int
}

func RetryDelay(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	delay := 15 * time.Second
	for i := 1; i < attempts; i++ {
		delay *= 2
		if delay > 15*time.Minute {
			return 15 * time.Minute
		}
	}
	return delay
}

const ClaimPendingSQL = `
		WITH picked AS (
			SELECT id
			FROM notification_job
			WHERE status = 'pending' AND available_at <= NOW()
			ORDER BY available_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notification_job j
		SET claimed_at = NOW(),
		    attempts = j.attempts + 1,
		    available_at = NOW() + interval '2 minutes',
		    updated_at = NOW()
		FROM picked
		WHERE j.id = picked.id
		RETURNING j.id, j.user_id, j.kind, j.channel, j.event_id, j.payload, j.attempts
	`

func ClaimPending(ctx context.Context, db *sql.DB, limit int) ([]Job, error) {
	rows, err := db.QueryContext(ctx, ClaimPendingSQL, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to claim notification jobs: %w", err)
	}
	defer rows.Close()

	var claimed []Job
	var invalidIDs []string
	for rows.Next() {
		var job Job
		var raw []byte
		if err := rows.Scan(&job.ID, &job.UserID, &job.Kind, &job.Channel, &job.EventID, &raw, &job.Attempts); err != nil {
			return nil, err
		}
		payload, err := privacy.Parse(raw)
		if err != nil {
			invalidIDs = append(invalidIDs, job.ID)
			continue
		}
		job.Payload = payload
		job.RawPayload = raw
		if payload.MinutesBefore != nil {
			job.MinutesBefore = *payload.MinutesBefore
		}
		if payload.InboundCount != nil {
			job.InboundCount = *payload.InboundCount
		}
		claimed = append(claimed, job)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	for _, id := range invalidIDs {
		if err := MarkInvalid(ctx, db, id); err != nil {
			return claimed, err
		}
	}
	return claimed, nil
}

func MarkSent(ctx context.Context, db *sql.DB, id string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE notification_job SET status = 'sent', updated_at = NOW() WHERE id = $1
	`, id)
	return err
}

func MarkFailed(ctx context.Context, db *sql.DB, id string, delay time.Duration, reason string) error {
	message := strings.TrimSpace(reason)
	if message == "" {
		message = "send failed"
	}
	if len(message) > 200 {
		message = message[:200]
	}
	seconds := int(delay.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	_, err := db.ExecContext(ctx, `
		UPDATE notification_job
		SET status = 'pending',
		    available_at = NOW() + $2::interval,
		    last_error = $3,
		    claimed_at = NULL,
		    updated_at = NOW()
		WHERE id = $1
	`, id, fmt.Sprintf("%d seconds", seconds), message)
	return err
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func MarkSkipped(ctx context.Context, db execer, id string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE notification_job SET status = 'skipped', updated_at = NOW() WHERE id = $1
	`, id)
	return err
}

func MarkInvalid(ctx context.Context, db *sql.DB, id string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE notification_job
		SET status = 'skipped', last_error = 'invalid payload', updated_at = NOW()
		WHERE id = $1
	`, id)
	return err
}

func InsertLog(ctx context.Context, db *sql.DB, job Job, status string) error {
	eventID := ""
	if job.EventID.Valid {
		eventID = job.EventID.String
	}
	_, err := db.ExecContext(ctx, `
		INSERT INTO notification_log (
			id, event_id, user_id, notification_type, minutes_before, sent_at, status, created_at
		) VALUES (
			$1, $2, $3, $4, $5, NOW(), $6, NOW()
		)
	`, fmt.Sprintf("%d", time.Now().UnixNano()), eventID, job.UserID, job.Channel, job.MinutesBefore, status)
	return err
}

func DeletePushDevice(ctx context.Context, db *sql.DB, tokenHash string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM push_device WHERE token_hash = $1`, tokenHash)
	return err
}

func UpdatePushDeviceEnvironment(ctx context.Context, db *sql.DB, tokenHash, environment string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE push_device SET environment = $2, updated_at = NOW() WHERE token_hash = $1
	`, tokenHash, environment)
	return err
}

type PushDevice struct {
	Token       string
	BundleID    string
	Environment string
	TokenHash   string
}

func ListPushDevices(ctx context.Context, db *sql.DB, userID string) ([]PushDevice, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT token, bundle_id, environment, token_hash
		FROM push_device
		WHERE user_id = $1 AND is_enabled = TRUE
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var devices []PushDevice
	for rows.Next() {
		var device PushDevice
		if err := rows.Scan(&device.Token, &device.BundleID, &device.Environment, &device.TokenHash); err != nil {
			return nil, err
		}
		devices = append(devices, device)
	}
	return devices, rows.Err()
}

// ReminderEvent deliberately excludes title, location, description and names: reminders stay generic.
type ReminderEvent struct {
	EncryptedTitle string
	Start          time.Time
	End            time.Time
	AllDay         bool
}

type ReminderUser struct {
	Name       string
	Email      string
	TimeZone   string
	TimeFormat string
}

// LoadReminderSQL reads encrypted_display_title via to_jsonb so it also runs pre-migration.
const LoadReminderSQL = `
		SELECT
			(
				SELECT to_jsonb(en) ->> 'encrypted_display_title'
				FROM event_notification en
				WHERE en.event_id = ce.id
				  AND to_jsonb(en) ->> 'encrypted_display_title' IS NOT NULL
				ORDER BY en.updated_at DESC
				LIMIT 1
			),
			ce.start, ce."end", ce.all_day,
			u.name, u.email, COALESCE(us.timezone, 'UTC'), COALESCE(us."timeFormat", '24h')
		FROM calendar_event ce
		INNER JOIN "user" u ON u.id = ce.user_id
		LEFT JOIN user_settings us ON us.user_id = u.id
		WHERE ce.id = $1 AND ce.user_id = $2
	`

func LoadReminder(ctx context.Context, db *sql.DB, eventID, userID string) (ReminderEvent, ReminderUser, error) {
	var event ReminderEvent
	var user ReminderUser
	var encryptedTitle sql.NullString
	err := db.QueryRowContext(ctx, LoadReminderSQL, eventID, userID).Scan(
		&encryptedTitle, &event.Start, &event.End, &event.AllDay,
		&user.Name, &user.Email, &user.TimeZone, &user.TimeFormat,
	)
	if err != nil {
		return ReminderEvent{}, ReminderUser{}, err
	}
	if encryptedTitle.Valid {
		event.EncryptedTitle = strings.TrimSpace(encryptedTitle.String)
	}
	return event, user, nil
}

// StartClock formats the event start in the user's timezone, or "" for all-day events.
func StartClock(event ReminderEvent, user ReminderUser) string {
	if event.AllDay || event.Start.IsZero() {
		return ""
	}
	loc := time.UTC
	if user.TimeZone != "" {
		if loaded, err := time.LoadLocation(user.TimeZone); err == nil {
			loc = loaded
		}
	}
	layout := "15:04"
	if user.TimeFormat == "12h" {
		layout = "3:04 PM"
	}
	return event.Start.In(loc).Format(layout)
}
