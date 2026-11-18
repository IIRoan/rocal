package main

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/TwiN/gatus/v5/config"
	"github.com/TwiN/gatus/v5/config/endpoint"
	"github.com/TwiN/gatus/v5/storage/store"
	"github.com/TwiN/gatus/v5/storage/store/common"
	"github.com/TwiN/gatus/v5/storage/store/common/paging"
	"gopkg.in/yaml.v3"
)

func TestSolaceRetainsRetiredEndpointHistory(t *testing.T) {
	cfg := &config.Config{}
	if err := yaml.Unmarshal([]byte(`
storage:
  type: sqlite
endpoints:
  - name: api-mail-jmap-private
    group: Application
`), cfg); err != nil {
		t.Fatal(err)
	}
	cfg.Storage.Path = filepath.Join(t.TempDir(), "gatus.db")
	if err := cfg.Storage.ValidateAndSetDefaults(); err != nil {
		t.Fatal(err)
	}
	if err := store.Initialize(cfg.Storage); err != nil {
		t.Fatal(err)
	}

	previous := &endpoint.Endpoint{Name: "api-mail-jmap", Group: "Application"}
	unconfigured := &endpoint.Endpoint{Name: "unused", Group: "Application"}
	current := cfg.Endpoints[0]
	timestamp := time.Now().Add(-time.Minute)
	for check, duration := range map[*endpoint.Endpoint]time.Duration{
		previous: 80 * time.Millisecond, current: 2 * time.Millisecond, unconfigured: 1 * time.Millisecond,
	} {
		result := &endpoint.Result{Timestamp: timestamp, Success: true, Duration: duration}
		if err := store.Get().InsertEndpointResult(check, result); err != nil {
			t.Fatal(err)
		}
	}
	store.Get().Close()

	initializeStorage(cfg)
	store.Get().Close()
	cfg.Endpoints = []*endpoint.Endpoint{previous}
	initializeStorage(cfg)
	defer store.Get().Close()

	for check, expectedMs := range map[*endpoint.Endpoint]int{previous: 80, current: 2} {
		params := paging.NewEndpointStatusParams().WithResults(1, 10).WithEvents(1, 10)
		status, err := store.Get().GetEndpointStatusByKey(check.Key(), params)
		if err != nil {
			t.Fatal(err)
		}
		if len(status.Results) != 1 || status.Results[0].Duration.Milliseconds() != int64(expectedMs) || len(status.Events) == 0 {
			t.Fatalf("expected results and events for %s, got %+v", check.Key(), status)
		}
		average, err := store.Get().GetAverageResponseTimeByKey(check.Key(), timestamp.Add(-time.Hour), time.Now())
		if err != nil || average != expectedMs {
			t.Fatalf("expected %d ms of retained history for %s, got %d ms (%v)", expectedMs, check.Key(), average, err)
		}
	}
	if _, err := store.Get().GetEndpointStatusByKey(unconfigured.Key(), paging.NewEndpointStatusParams()); !errors.Is(err, common.ErrEndpointNotFound) {
		t.Fatalf("expected unrelated endpoint to be pruned, got %v", err)
	}
}
