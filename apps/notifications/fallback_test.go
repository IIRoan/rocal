package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"notifications/internal/jobs"
	"notifications/internal/privacy"
)

var errFallbackDB = errors.New("injected database failure")

type fallbackDB struct {
	failAt        string
	inTx          bool
	status        string
	emails        int
	pendingStatus string
	pendingEmails int
	committed     bool
	rolledBack    bool
}

func (db *fallbackDB) Connect(context.Context) (driver.Conn, error) { return db, nil }
func (db *fallbackDB) Driver() driver.Driver                        { return nil }
func (db *fallbackDB) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (db *fallbackDB) Close() error { return nil }
func (db *fallbackDB) Begin() (driver.Tx, error) {
	if db.failAt == "begin" {
		return nil, errFallbackDB
	}
	db.inTx = true
	db.pendingStatus, db.pendingEmails = db.status, db.emails
	return db, nil
}
func (db *fallbackDB) Commit() error {
	db.inTx = false
	if db.failAt == "commit" {
		return errFallbackDB
	}
	db.status, db.emails = db.pendingStatus, db.pendingEmails
	db.committed = true
	return nil
}
func (db *fallbackDB) Rollback() error {
	db.inTx = false
	db.rolledBack = true
	return nil
}
func (db *fallbackDB) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	switch {
	case strings.Contains(query, "SET status = 'skipped'"):
		if db.failAt == "skip" {
			return nil, errFallbackDB
		}
		if db.inTx {
			db.pendingStatus = "skipped"
		} else {
			db.status = "skipped"
		}
	case strings.Contains(query, "INSERT INTO notification_job"):
		if db.failAt == "insert" {
			return nil, errFallbackDB
		}
		if db.inTx {
			db.pendingEmails++
		} else {
			db.emails++
		}
	default:
		return nil, errors.New("unexpected query")
	}
	return driver.RowsAffected(1), nil
}

func TestSkipJobEmailFallbackAtomic(t *testing.T) {
	for _, failAt := range []string{"begin", "skip", "insert", "commit", ""} {
		t.Run("failure_"+failAt, func(t *testing.T) {
			db := &fallbackDB{failAt: failAt, status: "pending"}
			server := newTestServer(t)
			server.db = sql.OpenDB(db)
			t.Cleanup(func() { _ = server.db.Close() })
			job := jobs.Job{
				ID: "push-1", UserID: "user-1", Kind: "event_reminder", Channel: "push",
				EventID: sql.NullString{String: "event-1", Valid: true}, MinutesBefore: 15,
				Payload: privacy.Payload{EmailFallback: true},
			}
			err := server.dispatchJob(context.Background(), job)
			if failAt != "" {
				if !errors.Is(err, errFallbackDB) || errors.Is(err, errJobSkipped) {
					t.Fatalf("expected retryable database failure, got %v", err)
				}
				if db.status != "pending" || db.emails != 0 || db.committed {
					t.Fatalf("failed fallback persisted partial writes: %+v", db)
				}
				if (failAt == "skip" || failAt == "insert") && !db.rolledBack {
					t.Fatal("expected transaction rollback")
				}
				db.failAt = ""
				err = server.dispatchJob(context.Background(), job)
			}
			if !errors.Is(err, errJobSkipped) || !db.committed || db.status != "skipped" || db.emails != 1 {
				t.Fatalf("expected one committed fallback and skipped push, got err=%v db=%+v", err, db)
			}
		})
	}
}

func TestSkipJobWithoutFallbackPropagatesFailure(t *testing.T) {
	db := &fallbackDB{failAt: "skip", status: "pending"}
	server := newTestServer(t)
	server.db = sql.OpenDB(db)
	t.Cleanup(func() { _ = server.db.Close() })
	err := server.skipJob(context.Background(), jobs.Job{ID: "email-1", Channel: "email"}, "unconfigured")
	if !errors.Is(err, errFallbackDB) || db.status != "pending" || db.emails != 0 {
		t.Fatalf("expected retryable skip failure without fallback, got err=%v db=%+v", err, db)
	}
}
