package push

// Keep in sync with packages/calendar-core/src/push-device.ts.
var (
	calendarBundleIDs = map[string]bool{"onl.solace.mobile": true, "onl.solace.mobile.dev": true}
	mailBundleIDs     = map[string]bool{"onl.solace.mail": true, "onl.solace.mail.dev": true}
)

// BundleReceivesKind reports whether the iOS app with bundleID handles pushes of kind; Calendar and Mail ship as separate apps.
func BundleReceivesKind(bundleID, kind string) bool {
	switch kind {
	case "event_reminder":
		return calendarBundleIDs[bundleID]
	case "new_mail":
		return mailBundleIDs[bundleID]
	default:
		return false
	}
}
