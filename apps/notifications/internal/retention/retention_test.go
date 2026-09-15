package retention

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeResult int64

func (r fakeResult) LastInsertId() (int64, error) { return 0, nil }
func (r fakeResult) RowsAffected() (int64, error) { return int64(r), nil }

type execCall struct {
	query string
	args  []any
}

type fakeDB struct {
	calls    []execCall
	affected func(call int, query string) (int64, error)
}

func (f *fakeDB) ExecContext(_ context.Context, query string, args ...any) (sql.Result, error) {
	f.calls = append(f.calls, execCall{query: query, args: args})
	n, err := f.affected(len(f.calls), query)
	if err != nil {
		return nil, err
	}
	return fakeResult(n), nil
}

func TestRulesUseMappedColumnsAndBoundedBatches(t *testing.T) {
	for _, rule := range Rules {
		if !strings.Contains(rule.Query, "LIMIT $2 FOR UPDATE SKIP LOCKED") {
			t.Fatalf("%s: expected bounded, skip-locked batch delete", rule.Name)
		}
		if !strings.Contains(rule.Query, "< $1") {
			t.Fatalf("%s: expected cutoff parameter", rule.Name)
		}
		for _, camel := range []string{"expiresAt", "updatedAt", "createdAt", "lastSeenAt", "claimedAt"} {
			if strings.Contains(rule.Query, camel) {
				t.Fatalf("%s: uses unmapped column %s", rule.Name, camel)
			}
		}
		if rule.Retention <= 0 {
			t.Fatalf("%s: retention must be positive", rule.Name)
		}
	}
}

func TestRulesNeverDeletePendingNotificationJobs(t *testing.T) {
	for _, rule := range Rules {
		if !strings.Contains(rule.Query, "notification_job") {
			continue
		}
		where := rule.Query[strings.LastIndex(rule.Query, "WHERE"):]
		if !strings.Contains(where, "status = 'sent'") && !strings.Contains(where, "status NOT IN ('pending', 'sent')") {
			t.Fatalf("%s: notification_job rule must exclude pending jobs, got %s", rule.Name, where)
		}
	}
}

func TestRetentionWindows(t *testing.T) {
	cases := map[string]time.Duration{
		"session":               24 * time.Hour,
		"verification":          24 * time.Hour,
		"notification_job_sent": 7 * 24 * time.Hour,
		"notification_job_dead": 30 * 24 * time.Hour,
		"notification_log":      30 * 24 * time.Hour,
		"push_device":           180 * 24 * time.Hour,
	}
	found := map[string]bool{}
	for _, rule := range Rules {
		if want, ok := cases[rule.Name]; ok {
			found[rule.Name] = true
			if rule.Retention != want {
				t.Fatalf("%s retention = %s, want %s", rule.Name, rule.Retention, want)
			}
		}
	}
	if len(found) != len(cases) {
		t.Fatalf("missing rules: got %v", found)
	}
}

func TestRunRulesBatchesUntilShortBatch(t *testing.T) {
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	rules := []Rule{{Name: "a", Retention: time.Hour, Query: "A"}, {Name: "b", Retention: 2 * time.Hour, Query: "B"}}
	counts := map[string][]int64{"A": {10, 10, 3}, "B": {0}}
	db := &fakeDB{affected: func(_ int, query string) (int64, error) {
		next := counts[query][0]
		counts[query] = counts[query][1:]
		return next, nil
	}}

	result, err := RunRules(context.Background(), db, now, rules, 10, 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["a"] != 23 || result["b"] != 0 || result.Total() != 23 {
		t.Fatalf("unexpected result %v", result)
	}
	if len(db.calls) != 4 {
		t.Fatalf("expected 4 statements, got %d", len(db.calls))
	}
	if got := db.calls[0].args[0].(time.Time); !got.Equal(now.Add(-time.Hour)) {
		t.Fatalf("cutoff = %s", got)
	}
	if got := db.calls[3].args[0].(time.Time); !got.Equal(now.Add(-2 * time.Hour)) {
		t.Fatalf("cutoff = %s", got)
	}
	if got := db.calls[0].args[1].(int); got != 10 {
		t.Fatalf("batch size arg = %d", got)
	}
}

func TestRunRulesStopsAtMaxBatches(t *testing.T) {
	db := &fakeDB{affected: func(int, string) (int64, error) { return 5, nil }}
	result, err := RunRules(context.Background(), db, time.Now(), []Rule{{Name: "a", Retention: time.Hour, Query: "A"}}, 5, 3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(db.calls) != 3 || result["a"] != 15 {
		t.Fatalf("expected 3 bounded batches, got %d calls and %v", len(db.calls), result)
	}
}

func TestRunRulesContinuesAfterRuleError(t *testing.T) {
	boom := errors.New("boom")
	db := &fakeDB{affected: func(_ int, query string) (int64, error) {
		if query == "A" {
			return 0, boom
		}
		return 2, nil
	}}
	rules := []Rule{{Name: "a", Retention: time.Hour, Query: "A"}, {Name: "b", Retention: time.Hour, Query: "B"}}
	result, err := RunRules(context.Background(), db, time.Now(), rules, 10, 10)
	if !errors.Is(err, boom) || !strings.Contains(err.Error(), "retention a") {
		t.Fatalf("expected joined rule error, got %v", err)
	}
	if result["b"] != 2 {
		t.Fatalf("expected rule b to still run, got %v", result)
	}
}

func TestRunRulesHonorsCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	db := &fakeDB{affected: func(int, string) (int64, error) { return 0, nil }}
	if _, err := RunRules(ctx, db, time.Now(), Rules, 10, 10); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context cancellation, got %v", err)
	}
	if len(db.calls) != 0 {
		t.Fatalf("expected no statements after cancellation, got %d", len(db.calls))
	}
}
