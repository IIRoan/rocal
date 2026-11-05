package sql

import (
	"testing"
	"time"

	"github.com/TwiN/gatus/v5/config/endpoint"
	"github.com/TwiN/gatus/v5/storage"
)

func TestSolaceHourlyUptimeEntriesAreKeptForThirtyDays(t *testing.T) {
	store, err := NewStore("sqlite", t.TempDir()+"/solace-uptime.db", false, storage.DefaultMaximumNumberOfResults, storage.DefaultMaximumNumberOfEvents)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	start := time.Now().Truncate(time.Hour)
	const hours = 30 * 24
	for i := hours; i > 0; i-- {
		if err := store.InsertEndpointResult(&testEndpoint, &endpoint.Result{Timestamp: start.Add(-time.Duration(i) * time.Hour), Success: true}); err != nil {
			t.Fatal(err)
		}
	}
	tx, err := store.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	entries, err := store.getNumberOfUptimeEntriesByEndpointID(tx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if entries != hours {
		t.Fatalf("expected %d hourly uptime entries, got %d (older hours were merged into days)", hours, entries)
	}
}
