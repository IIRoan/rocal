# Native end-to-end tests

`Native end-to-end` builds **both native apps in Release mode** and drives them with the pinned Maestro CLI on an iOS Simulator and an Android emulator. Four build jobs compile the apps independently, then each device job installs both apps and uses one newly invited account, so Mail must unlock the account key created by Calendar. It runs on relevant pull requests, default-branch/testing pushes and manual dispatches. This supplements the workspace unit tests and black-box API suite; it does not replace them.

Each device job owns a disposable `solace_test_e2e` database, the real Rust API, Stalwart 1.0.0 and the same avatar S3 mock used by the API suite. Linux uses the existing Podman test services. macOS runs PostgreSQL, checksum-pinned Stalwart/CLI binaries and the checksum-pinned S3Mock JAR directly. Mail delivery stays within `solace.test`; the test mail plan blackholes external delivery. No EAS, Apple signing, App Review or production-service secrets are used.

The apps use separate `.e2e` bundle IDs, App Groups and keychains. `SOLACE_E2E=1` is accepted only for a locally configured preview build pointing at a loopback HTTP API; remote updates are disabled. The test-only transport settings cannot be enabled for an EAS or production build. Android Release builds exercise minification as well as the real native modules.

## Coverage

| Journey | Assertions |
| --- | --- |
| Authentication | A wrong password is rejected; correct sign-in initializes real encryption; process restart restores the session. |
| Calendars | Empty-name validation, create, rename, assign an event, hide/show its actual agenda entry, persistence across restart and deletion with its events. |
| Events | Create an all-day event, persist title/location/description, edit, reopen after process restart, open native ICS sharing, delete a separate event and retain the original. |
| Timed events | Open both native time wheels, change the start minute and assert it changed, save, restart, reopen the editor and verify both time values survived before deleting it. |
| Recurrence | Create a weekly series, edit all occurrences, restart, delete the entire series and preserve unrelated events. |
| Categories | Create, assign to an event, rename and delete; re-opening the event must retain its other encrypted fields. |
| Navigation | Agenda/week/month views, account drawer, nested settings pages, timezone search and changes retained after restart, theme changes and drawer dismissal. |
| Profile picture | Pick a seeded system-library image, re-encode/upload it, fetch it through the authenticated avatar route and remove it. |
| Mail encryption and drafts | Mail unlocks Calendar's existing account, creates an encrypted draft, reopens it after restart and sends it to the same local mailbox. |
| Delivery and reader | Receive the submitted message, decrypt both Inbox and Sent copies, star/unstar and open a quoted reply. |
| Message actions and search | Search decrypted message bodies on-device, mark unread, move to the UI-created custom mailbox, reopen after restart, move to Trash and restore to Inbox without losing decrypted content. |
| Mailboxes and labels | Create/rename/hide/show/delete a custom mailbox and create/reopen/delete an encrypted label. |
| Mail controls | Open the filter drawer and native attachment picker; cancellation returns to the composer without losing navigation. |
| Offline and recovery | Suspend the actual API process, restart Mail and read its encrypted snapshot; resume the API and repeat the online delivery/reader assertions. |
| Sign-out | End the session, hide mailbox content, sign in again, unwrap the existing keys and decrypt the same message. |
| Server postconditions | UI-created calendars/events/preferences exist as ciphertext and journey event content is absent from readable database columns. |

Assertions wait for specific UI states. A failed case is recorded and fails the job; there are no retries that turn a failing journey green. Every process restart must restore the existing session without another sign-in. Calendar content cases explicitly select Agenda before inspecting records; view switching is asserted separately. A failed authentication/content prerequisite stops dependent cases immediately. A successful run requires every case, including offline recovery, to execute. Theme, dates and test content are controlled by the journeys rather than a production account's existing data.

Native push delivery/NSE execution on a real device, associated-domain passkeys, biometric prompts, App Store distribution and external providers are outside simulator coverage. Attachment selection is currently tested through opening/canceling the system picker; attachment delivery is covered by the existing API/component tests rather than this native journey. These boundaries should stay explicit as new journeys are added.

## Evidence and diagnosis

Each platform uploads `junit.xml`, `results.json`, a Markdown summary and screenshots. Failed journeys also capture a minimized accessibility hierarchy with selector fields, bounds and state flags; password nodes and fixture credentials are removed. Maestro's raw command output and traces, credentials, session data and service databases stay under `private/` and are never uploaded. Regression tests check hierarchy sanitization, command-output isolation, evidence export and symlink escapes with secret sentinels. Account credentials are freshly seeded local test values, not the App Review account. Test failures show the case name in the Actions log and the report; screenshots preserve the actual failure screen.

The binary cache covers application/package source, patches, the lockfile, pinned Bun/Node versions, root manifest, build helpers/workflow and runner image/toolchain. Journey-only edits reuse the compiled binaries; app source changes rebuild them. Build artifacts transfer the apps in tar archives to preserve executable bits and framework symlinks, with a regression test for that contract. These archives contain compiled test apps before any account signs in. Maestro installs its pinned device driver on the first journey and reuses it for later journeys. Native animations remain enabled.

## Local execution

The helpers require `SOLACE_E2E=1` and an absolute `SOLACE_E2E_DIR` whose final directory is `solace-e2e`. Use a new temporary directory. Do not share it with another run. Ports 4001, 55432, 58080 and 59000 must be free; macOS also uses SMTP port 2525 and Android uses the isolated emulator port 5580.

Use the repository's pinned Bun, Node and Rust. Linux needs Podman, Android SDK tools and Java 21. macOS needs Xcode with an iOS runtime, CocoaPods, Java 21 and Homebrew `postgresql@18`/Python 3.13. The workflow contains the reproducible setup sequence.

```sh
export SOLACE_E2E=1 APP_VARIANT=preview EXPO_NO_DOTENV=1
export EXPO_PUBLIC_API_URL=http://127.0.0.1:4001
export EXPO_PUBLIC_APP_URL=http://localhost:4100
export SOLACE_E2E_DIR="$(mktemp -d)/solace-e2e"
cargo build -p xtask
python3 scripts/e2e/services.py start
mkdir -p "$SOLACE_E2E_DIR/private"
./target/debug/xtask e2e serve > "$SOLACE_E2E_DIR/private/backend.log" 2>&1 &
echo "$!" > "$SOLACE_E2E_DIR/private/backend.pid"
python3 scripts/e2e/services.py wait-api
./target/debug/xtask e2e seed
python3 scripts/e2e/build.py android
python3 scripts/e2e/device.py android
python3 scripts/e2e/run.py android
./target/debug/xtask e2e verify
python3 scripts/e2e/services.py stop
```

Use `ios` for the three platform arguments on macOS. The server refuses non-loopback services and reads no developer `.env` overrides. Starting it recreates only `solace_test_e2e`. Cleanup stops owned API/device processes; local Linux shared test containers are retained. CI always cleans up, including after failures.
