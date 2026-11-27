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

func TestSolaceMeasuredTimingsSurviveRawRetention(t *testing.T) {
	store, err := NewStore("sqlite", t.TempDir()+"/timing.db", false, 4, storage.DefaultMaximumNumberOfEvents)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	stamp := time.Now().Truncate(time.Hour)
	for index, sample := range []struct {
		duration time.Duration
		measured bool
	}{
		{250 * time.Microsecond, true},
		{750 * time.Microsecond, true},
		{0, true},
		{-1, false},
	} {
		if err := store.InsertEndpointResult(&testEndpoint, &endpoint.Result{
			Timestamp: stamp.Add(time.Duration(index) * time.Second), Success: sample.measured,
			Duration: sample.duration, ServerTimingMeasured: sample.measured,
		}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.db.Exec("DELETE FROM endpoint_results"); err != nil {
		t.Fatal(err)
	}
	var samples, total int64
	if err := store.db.QueryRow("SELECT samples, total_ns FROM solace_server_timings").Scan(&samples, &total); err != nil {
		t.Fatal(err)
	}
	if samples != 3 || total != 1_000_000 {
		t.Fatalf("expected 3 valid samples totaling 1ms, got %d and %dns", samples, total)
	}
	if _, err := store.db.Exec("DELETE FROM endpoint_uptimes"); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow("SELECT COUNT(*) FROM solace_server_timings").Scan(&samples); err != nil || samples != 0 {
		t.Fatalf("timing data must expire with the uptime row: got %d (%v)", samples, err)
	}
}
