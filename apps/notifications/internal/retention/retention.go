// Package retention deletes ephemeral rows in bounded batches that never block the job claimer.
package retention

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const day = 24 * time.Hour

// Retention windows. Keep apps/notifications/README.md in sync.
const (
	// Interval is how often the worker runs the cleanup.
	Interval = time.Hour
	// BatchSize bounds rows deleted per statement.
	BatchSize = 500
	// MaxBatchesPerRule bounds work per rule per run; leftovers go next run.
	MaxBatchesPerRule = 200

	// SessionGrace: expired Better Auth sessions are unusable.
	SessionGrace = 1 * day
	// VerificationGrace: expired verification values (email/OTP/passkey challenges).
	VerificationGrace = 1 * day
	// OAuthTokenGrace: expired OAuth access and refresh tokens.
	OAuthTokenGrace = 1 * day
	// InviteInactiveRetention: how long expired, revoked and abandoned invites stay visible.
	InviteInactiveRetention = 30 * day
	// NotificationJobSentRetention: delivered jobs (also the new-mail push dedupe window).
	NotificationJobSentRetention = 7 * day
	// NotificationJobDeadRetention: skipped/failed jobs, kept longer for debugging.
	NotificationJobDeadRetention = 30 * day
	// NotificationLogRetention: delivery audit rows (nothing reads them back).
	NotificationLogRetention = 30 * day
	// PushDeviceStaleAfter: devices whose app has not re-registered in this long.
	PushDeviceStaleAfter = 180 * day
)

// Rule is one bounded delete. Query takes $1 = cutoff, $2 = batch size.
type Rule struct {
	Name      string
	Retention time.Duration
	Query     string
}

func batchDelete(table, where string) string {
	return fmt.Sprintf(
		`DELETE FROM "%s" WHERE id IN (SELECT id FROM "%s" WHERE %s LIMIT $2 FOR UPDATE SKIP LOCKED)`,
		table, table, where,
	)
}

// Rules lists every cleanup; pending notification jobs (including leased ones) are never selected.
var Rules = []Rule{
	{"session", SessionGrace, batchDelete("session", "expires_at < $1")},
	{"verification", VerificationGrace, batchDelete("verification", "expires_at < $1")},
	{"oauth_access_token", OAuthTokenGrace, batchDelete("oauth_access_token", "expires_at < $1")},
	{"oauth_refresh_token", OAuthTokenGrace, batchDelete("oauth_refresh_token", "expires_at < $1")},
	{"invite_expired", InviteInactiveRetention, batchDelete("invite", "status = 'pending' AND expires_at < $1")},
	{"invite_revoked", InviteInactiveRetention, batchDelete("invite", "status = 'revoked' AND updated_at < $1")},
	{"invite_abandoned_claim", InviteInactiveRetention, batchDelete("invite", "status = 'claimed' AND claimed_at < $1")},
	{"notification_job_sent", NotificationJobSentRetention, batchDelete("notification_job", "status = 'sent' AND updated_at < $1")},
	{"notification_job_dead", NotificationJobDeadRetention, batchDelete("notification_job", "status NOT IN ('pending', 'sent') AND updated_at < $1")},
	{"notification_log", NotificationLogRetention, batchDelete("notification_log", "created_at < $1")},
	{"push_device", PushDeviceStaleAfter, batchDelete("push_device", "last_seen_at < $1")},
}

// Execer is the subset of *sql.DB the cleanup needs.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// Result maps rule name to deleted row count.
type Result map[string]int64

// Total returns the number of rows deleted across all rules.
func (r Result) Total() int64 {
	var total int64
	for _, count := range r {
		total += count
	}
	return total
}

// Run executes every rule; a failing rule does not stop the others and errors carry only rule names.
func Run(ctx context.Context, db Execer, now time.Time) (Result, error) {
	return RunRules(ctx, db, now, Rules, BatchSize, MaxBatchesPerRule)
}

// RunRules is Run with explicit rules and bounds (for tests).
func RunRules(ctx context.Context, db Execer, now time.Time, rules []Rule, batchSize, maxBatches int) (Result, error) {
	result := Result{}
	var errs []error
	for _, rule := range rules {
		cutoff := now.Add(-rule.Retention)
		for batch := 0; batch < maxBatches; batch++ {
			if err := ctx.Err(); err != nil {
				return result, errors.Join(append(errs, err)...)
			}
			res, err := db.ExecContext(ctx, rule.Query, cutoff, batchSize)
			if err != nil {
				errs = append(errs, fmt.Errorf("retention %s: %w", rule.Name, err))
				break
			}
			affected, err := res.RowsAffected()
			if err != nil {
				errs = append(errs, fmt.Errorf("retention %s: %w", rule.Name, err))
				break
			}
			result[rule.Name] += affected
			if affected < int64(batchSize) {
				break
			}
		}
	}
	return result, errors.Join(errs...)
}
