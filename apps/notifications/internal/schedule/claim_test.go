package schedule

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"
)

type recordedExec struct {
	query string
	args  []driver.Value
}

// fakeDB serves claimDueSQL rows from memory and records every Exec so job inserts can be asserted.
type fakeDB struct {
	dueRows   [][]driver.Value
	execs     []recordedExec
	committed bool
}

func (f *fakeDB) Connect(context.Context) (driver.Conn, error) { return &fakeConn{db: f}, nil }
func (f *fakeDB) Driver() driver.Driver                        { return nil }

type fakeConn struct{ db *fakeDB }

func (c *fakeConn) Prepare(query string) (driver.Stmt, error) {
	return &fakeStmt{db: c.db, query: query}, nil
}
func (c *fakeConn) Close() error              { return nil }
func (c *fakeConn) Begin() (driver.Tx, error) { return &fakeTx{db: c.db}, nil }

type fakeTx struct{ db *fakeDB }

func (t *fakeTx) Commit() error   { t.db.committed = true; return nil }
func (t *fakeTx) Rollback() error { return nil }

type fakeStmt struct {
	db    *fakeDB
	query string
}

func (s *fakeStmt) Close() error  { return nil }
func (s *fakeStmt) NumInput() int { return -1 }
func (s *fakeStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.db.execs = append(s.db.execs, recordedExec{query: s.query, args: args})
	return driver.RowsAffected(1), nil
}
func (s *fakeStmt) Query([]driver.Value) (driver.Rows, error) {
	return &fakeRows{rows: s.db.dueRows}, nil
}

type fakeRows struct {
	rows [][]driver.Value
	next int
}

func (r *fakeRows) Columns() []string {
	return []string{"id", "event_id", "user_id", "minutes_before", "email", "push", "has_device", "own_mailbox"}
}
func (r *fakeRows) Close() error { return nil }
func (r *fakeRows) Next(dest []driver.Value) error {
	if r.next >= len(r.rows) {
		return io.EOF
	}
	copy(dest, r.rows[r.next])
	r.next++
	return nil
}

func dueRow(id, eventID, userID string, email, push, hasDevice, ownMailbox bool) []driver.Value {
	return []driver.Value{id, eventID, userID, int64(15), email, push, hasDevice, ownMailbox}
}

func insertedChannels(t *testing.T, db *fakeDB) map[string][]string {
	t.Helper()
	byEvent := map[string][]string{}
	for _, exec := range db.execs {
		if !strings.Contains(exec.query, "INSERT INTO notification_job") {
			continue
		}
		kind, channel, eventID := exec.args[2], exec.args[3].(string), exec.args[4].(string)
		if kind != "event_reminder" {
			t.Fatalf("unexpected job kind %v", kind)
		}
		var payload map[string]any
		if err := json.Unmarshal(exec.args[5].([]byte), &payload); err != nil {
			t.Fatalf("job payload is not JSON: %v", err)
		}
		if payload["eventId"] != eventID {
			t.Fatalf("payload eventId %v does not match job event %s", payload["eventId"], eventID)
		}
		byEvent[eventID] = append(byEvent[eventID], channel)
	}
	return byEvent
}

func TestClaimDueQueuesOnlyPushForOwnMailboxUsers(t *testing.T) {
	db := &fakeDB{dueRows: [][]driver.Value{
		dueRow("n-own", "evt-own", "user-own", true, true, true, true),
		dueRow("n-external", "evt-external", "user-external", true, true, true, false),
		dueRow("n-own-no-device", "evt-own-no-device", "user-own-2", true, true, false, true),
	}}
	conn := sql.OpenDB(db)
	defer conn.Close()

	due, err := ClaimDue(context.Background(), conn, time.Date(2026, 9, 24, 12, 0, 30, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(due) != 3 || !due[0].MailsToOwnMailbox || due[1].MailsToOwnMailbox {
		t.Fatalf("own-mailbox flag was not scanned correctly: %+v", due)
	}
	if !db.committed {
		t.Fatal("expected the claim transaction to commit")
	}

	for _, exec := range db.execs {
		if strings.Contains(exec.query, "INSERT INTO notification_job") {
			flagged := strings.Contains(string(exec.args[5].([]byte)), `"emailFallback":true`)
			if flagged != (exec.args[4] == "evt-own") {
				t.Fatalf("event %v %v job: unexpected emailFallback=%v", exec.args[4], exec.args[3], flagged)
			}
		}
	}

	got := insertedChannels(t, db)
	want := map[string][]string{
		"evt-own":           {"push"},
		"evt-external":      {"email", "push"},
		"evt-own-no-device": {"email"},
	}
	for eventID, channels := range want {
		if strings.Join(got[eventID], ",") != strings.Join(channels, ",") {
			t.Fatalf("event %s: expected channels %v, got %v", eventID, channels, got[eventID])
		}
	}

	claimed := 0
	for _, exec := range db.execs {
		if strings.Contains(exec.query, "SET is_sent = TRUE") {
			claimed++
		}
	}
	if claimed != 3 {
		t.Fatalf("expected every schedule to be marked sent, got %d", claimed)
	}
}

func TestClaimDueMarksScheduleSentEvenWithoutChannels(t *testing.T) {
	db := &fakeDB{dueRows: [][]driver.Value{
		dueRow("n-off", "evt-off", "user-off", false, false, true, true),
	}}
	conn := sql.OpenDB(db)
	defer conn.Close()

	if _, err := ClaimDue(context.Background(), conn, time.Now()); err != nil {
		t.Fatal(err)
	}
	if got := insertedChannels(t, db); len(got) != 0 {
		t.Fatalf("expected no jobs when both channels are off, got %v", got)
	}
	if len(db.execs) != 1 || !strings.Contains(db.execs[0].query, "SET is_sent = TRUE") {
		t.Fatalf("expected only the sent marker, got %+v", db.execs)
	}
}

func TestQueueEmailFallbackInsertsReminderEmailWithoutFlag(t *testing.T) {
	db := &fakeDB{}
	conn := sql.OpenDB(db)
	defer conn.Close()

	if err := QueueEmailFallback(context.Background(), conn, "user-own", "evt-own", 15); err != nil {
		t.Fatal(err)
	}
	if got := insertedChannels(t, db); strings.Join(got["evt-own"], ",") != "email" {
		t.Fatalf("expected one fallback email job, got %v", got)
	}
	if strings.Contains(string(db.execs[0].args[5].([]byte)), "emailFallback") {
		t.Fatal("the fallback email must not fall back again")
	}
}
