package push

import "testing"

func TestBundleReceivesKind(t *testing.T) {
	cases := []struct {
		bundleID string
		kind     string
		want     bool
	}{
		{"onl.solace.calendar", "event_reminder", true},
		{"onl.solace.calendar.dev", "event_reminder", true},
		{"onl.solace.calendar", "new_mail", false},
		{"onl.solace.mail", "new_mail", true},
		{"onl.solace.mail.dev", "new_mail", true},
		{"onl.solace.mail", "event_reminder", false},
		{"com.example.app", "new_mail", false},
		{"onl.solace.mail", "unknown", false},
	}
	for _, tc := range cases {
		if got := BundleReceivesKind(tc.bundleID, tc.kind); got != tc.want {
			t.Errorf("BundleReceivesKind(%q, %q) = %v, want %v", tc.bundleID, tc.kind, got, tc.want)
		}
	}
}
