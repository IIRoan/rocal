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
	Subject       string
	Title         string
	FromName      string
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
		job.Subject = payload.Subject
		job.Title = payload.Title
		job.FromName = payload.FromName
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

func MarkSkipped(ctx context.Context, db *sql.DB, id string) error {
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

type ReminderEvent struct {
	Title           string
	Start           time.Time
	End             time.Time
	AllDay          bool
	EncryptionState string
	Location        string
	CalendarName    string
	Description     string
	CategoryName    string
	CategoryColor   string
}

type ReminderUser struct {
	Name     string
	Email    string
	TimeZone string
}

const LoadReminderSQL = `
		SELECT
			COALESCE(
				NULLIF(btrim((
					SELECT en.display_title
					FROM event_notification en
					WHERE en.event_id = ce.id
					  AND en.display_title IS NOT NULL
					  AND btrim(en.display_title) <> ''
					  AND btrim(en.display_title) <> 'Encrypted event'
					ORDER BY en.updated_at DESC
					LIMIT 1
				)), ''),
				NULLIF(NULLIF(btrim(ce.title), ''), 'Encrypted event')
			),
			ce.start, ce."end", ce.all_day, ce.encryption_state,
			ce.location, ce.description, c.name, ec.name, ec.color,
			u.name, u.email, COALESCE(us.timezone, 'UTC')
		FROM calendar_event ce
		INNER JOIN calendar c ON c.id = ce.calendar_id
		INNER JOIN "user" u ON u.id = ce.user_id
		LEFT JOIN user_settings us ON us.user_id = u.id
		LEFT JOIN event_category ec ON ec.id = ce.category_id
		WHERE ce.id = $1 AND ce.user_id = $2
	`

func LoadReminder(ctx context.Context, db *sql.DB, eventID, userID string) (ReminderEvent, ReminderUser, error) {
	var event ReminderEvent
	var user ReminderUser
	var location, description, categoryName, categoryColor sql.NullString
	err := db.QueryRowContext(ctx, LoadReminderSQL, eventID, userID).Scan(
		&event.Title, &event.Start, &event.End, &event.AllDay, &event.EncryptionState,
		&location, &description, &event.CalendarName, &categoryName, &categoryColor,
		&user.Name, &user.Email, &user.TimeZone,
	)
	if err != nil {
		return ReminderEvent{}, ReminderUser{}, err
	}
	if location.Valid {
		event.Location = location.String
	}
	if description.Valid {
		event.Description = description.String
	}
	if categoryName.Valid {
		event.CategoryName = categoryName.String
	}
	if categoryColor.Valid {
		event.CategoryColor = categoryColor.String
	}
	return event, user, nil
}
