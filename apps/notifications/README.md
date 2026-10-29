# notifications

Rust worker (`solace-notifications`, Railway, always-on): claims due reminders and `notification_job` rows every 5s, sends noreply mail over Stalwart JMAP (the API crate's mailer) and APNs push, and serves `/health` and `/status`.

Production JMAP uses `http://stalwart.railway.internal:8081` through Railway's encrypted private network. `STALWART_GATE_KEY` references the API's gate key; the worker passes it through the shared origin-restricted `StalwartGate`.

```sh
cargo run -p solace-notifications                          # local run; reads ../../retired/backend/.env if no .env is set
cargo run -p solace-notifications -- --test --test-push --test-to you@example.com  # one test email and push
cargo test -p solace-notifications                         # needs `cargo xtask test-env up`
```

## Push and reminder mail content

The worker never sees reminder titles or mail sender/subject. `notification_job.payload` holds opaque refs only (`kind`, `eventId`, `minutesBefore`, `emailFallback`, `inboundCount`, `emailId`, `accountId`); a payload with any other key is refused.

- Reminder email: generic ("You have an event at 3:04 PM. Open Solace to view the details."), no title/location/description/calendar names.
- No duplicate reminders: email is skipped when the reminder push goes out and the account email is the user's own Solace mailbox; that push carries `emailFallback`, so if it ends skipped (e.g. the device was unregistered) the email is queued instead. Reminder mail is sent from noreply with a `solace-reminder.…@<noreply domain>` Message-ID so the Stalwart webhook doesn't also send a `new_mail` push for it; both must match, since either header alone is forgeable (`REMINDER_MESSAGE_ID_PREFIX` in `apps/backend/src/mail/webhook.rs`, which the worker imports).
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

Hourly (`:17`), the worker deletes ephemeral rows in batches of 500 (`DELETE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)`, at most 200 batches per rule per run). Windows are the rules in `src/retention.rs`; logs contain counts only.

| Table                                        | Deleted when                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `session`, `verification`                    | `expires_at` older than 1 day                                    |
| `invite`                                     | pending past `expires_at` + 30d; revoked/abandoned claim after 30d; accepted invites are kept (inviter's history) |
| `notification_job`                           | `sent` after 7d; any other non-pending status after 30d (pending/leased never touched) |
| `notification_log`                           | `created_at` older than 30 days                                  |
| `push_device`                                | `last_seen_at` older than 180 days (app re-registers on launch)  |

`calendar_sync_log` is pruned by the backend (latest 50 per subscription). Account deletion is handled by the API (`apps/backend/src/account/`).
