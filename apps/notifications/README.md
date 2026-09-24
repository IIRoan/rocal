# notifications

Go worker (Railway, always-on): claims due reminders and `notification_job` rows every 5s, sends noreply mail over Stalwart JMAP and APNs push.

## Push and reminder mail content

The worker never sees reminder titles or mail sender/subject. `notification_job.payload` holds opaque refs only (`kind`, `eventId`, `minutesBefore`, `inboundCount`, `emailId`, `accountId`; legacy `title`/`subject`/`fromName` keys are tolerated and ignored).

- Reminder email: generic ("You have an event at 3:04 PM. Open Solace to view the details."), no title/location/description/calendar names.
- No duplicate reminders: email is skipped when the reminder push goes out and the account email is the user's own Solace mailbox. Reminder mail carries a `solace-reminder.` Message-ID so the Stalwart webhook doesn't also send a `new_mail` push for it (`apps/backend/lib/stalwart-webhook.ts`).
- APNs payloads are generic with `mutable-content: 1`; the iOS Notification Service Extension replaces the alert on-device. `body` keeps the `t`/`eid`/`mid` tap keys for older binaries.

```jsonc
// event_reminder: time in the user's timezone/time format; enc = encrypted_display_title (dropped if > 4096 bytes)
{ "aps": { "alert": { "title": "Event reminder", "body": "Starts at 15:30" }, "sound": "default", "mutable-content": 1, "thread-id": "event:<id>" },
  "type": "event_reminder", "eventId": "<id>", "enc": "v1.<iv>.<ciphertext>", "body": { "t": "event", "eid": "<id>" } }
// new_mail: the extension fetches from/subject/preview with JMAP Email/get
{ "aps": { "alert": { "title": "New mail", "body": "You have a new message" }, "sound": "default", "mutable-content": 1, "thread-id": "mail:<emailId>" },
  "type": "new_mail", "emailId": "<emailId>", "accountId": "<jmapAccountId>", "body": { "t": "mail", "mid": "<emailId>" } }
```

`encrypted_display_title` is read via `to_jsonb(...)`, so this worker can be deployed before the backend migration that adds the column.

## Retention cleanup

Hourly (`:17`), the worker deletes ephemeral rows in batches of 500 (`DELETE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)`, at most 200 batches per rule per run). Windows are constants in `internal/retention/retention.go`; logs contain counts only.

| Table                                        | Deleted when                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `session`, `verification`                    | `expires_at` older than 1 day                                    |
| `oauth_access_token`, `oauth_refresh_token`  | `expires_at` older than 1 day                                    |
| `invite`                                     | pending past `expires_at` + 30d; revoked/abandoned claim after 30d; accepted invites are kept (inviter's history) |
| `notification_job`                           | `sent` after 7d; any other non-pending status after 30d (pending/leased never touched) |
| `notification_log`                           | `created_at` older than 30 days                                  |
| `push_device`                                | `last_seen_at` older than 180 days (app re-registers on launch)  |

`calendar_sync_log` is pruned by the backend (latest 50 per subscription). Account deletion is handled in `apps/backend/services/account.service.ts`.
