# Native end-to-end tests

`Native end-to-end` builds **both native apps in Release mode** and drives them with the pinned Maestro CLI on an iOS Simulator and an Android emulator. Four build jobs compile the apps independently, then each device job runs 20 journeys with two newly invited accounts. Mail must unlock the first account key created by Calendar, initialize the second user's independent keys, and exchange encrypted replies between them. It runs on relevant pull requests, default-branch/testing pushes and manual dispatches. This supplements the workspace unit tests and black-box API suite; it does not replace them.

Each device job owns a disposable `solace_test_e2e` database, the real Rust API, Stalwart 1.0.0 and the same avatar S3 mock used by the API suite. Linux uses the existing Podman test services. macOS runs PostgreSQL, checksum-pinned Stalwart/CLI binaries and the checksum-pinned S3Mock JAR directly. Mail delivery stays within `solace.test`; the test mail plan blackholes external delivery. No EAS, Apple signing, App Review or production-service secrets are used.

The apps use separate `.e2e` bundle IDs, App Groups and keychains. `SOLACE_E2E=1` is accepted only for a locally configured preview build pointing at a loopback HTTP API; remote updates are disabled. The test-only transport settings cannot be enabled for an EAS or production build. Android Release builds exercise minification as well as the real native modules.

iOS journeys use Xcode 26.6 and the iOS 26.5 runtime. Setup opens Simulator with hardware-keyboard input disabled, and text entry waits for the software keyboard. These explicit settings keep input independent of the runner's default simulator preferences and newer toolchains.

## Coverage

| Journey | Assertions |
| --- | --- |
| Authentication | A wrong password is rejected; correct sign-in initializes real encryption; process restart restores the session; sign-out removes the local device keys and a new sign-in opens the password envelope and retained default calendars. |
| Calendars | Empty-name validation, create, rename, assign an event, hide/show its actual agenda entry, persistence across restart and deletion with its events. |
| Events | Create an all-day event, persist title/location/description, edit, reopen after process restart, open native ICS sharing, delete a separate event and retain the original. |
| Timed events | Open both native time wheels, change the start minute and assert it changed, save, restart, reopen the editor and verify both time values survived before deleting it. |
| Recurrence | Create a weekly series, edit all occurrences, restart, delete the entire series and preserve unrelated events. |
| Categories | Create, assign to an event, rename and delete; re-opening the event must retain its other encrypted fields. |
| Navigation | Agenda/week/month views, accessible month-day selection opening Day view, account drawer, nested settings pages, timezone search and changes retained after restart, theme changes and drawer dismissal. |
| Profile picture | Pick a seeded system-library image, re-encode/upload it, wait up to three minutes for the authenticated image to load and the change action to become enabled, then remove it. |
| Mail encryption and drafts | Mail unlocks Calendar's existing account, creates an encrypted draft, reopens it after restart and sends it to the same local mailbox. |
| Delivery and reader | Receive the submitted message, decrypt both Inbox and Sent copies, star/unstar and open a quoted reply. |
| Two-user conversation | Sign in as each user, send an initial message and two replies through Stalwart, verify delivery and signatures on both sides, and group the three incoming/Sent messages into one thread. Switching accounts must not expose the other user's message list. |
| Conversation opening | Restart and open the thread, switch between all three expanded bodies twice and reopen from the list. The first decrypted body has a 10-second wait budget, cached bodies five seconds, and transitions must settle within three seconds. Assertions target the expanded body and exclude later replies, so quoted history and collapsed previews cannot satisfy them. |
| Message actions and search | Search decrypted message bodies on-device, mark unread, move to the UI-created custom mailbox, reopen after restart, move to Trash and restore to Inbox without losing decrypted content. |
| Mailboxes and labels | Create/rename/hide/show/delete a custom mailbox and create/reopen/delete an encrypted label. |
| Mail controls | Open the filter drawer, wait for the composer drawer to settle and open the native attachment picker; cancellation returns to the composer without losing navigation. |
| Offline and recovery | Suspend the actual API process, restart Mail and read its encrypted snapshot; resume the API, wait for encryption and mail startup in the same process, then send and decrypt a fresh signed reply without relaunching. |
| Sign-out | End the session, hide mailbox content, sign in again, unwrap the existing keys and decrypt the same message. |
| Server postconditions | UI-created calendars/events/preferences exist as ciphertext, journey event content is absent from readable database columns, and both users have independent password envelopes and sealed mailbox vault secrets. |

Assertions wait for the workspace loading gate to disappear and for drawer motion to settle before tapping. Sign-in waits for each field to become editable and for the iOS software keyboard before typing. Text input also waits for keyboard and drawer motion before sending characters on either platform. Settings back navigation taps once, waits for the transition and verifies the drawer stays open before selecting another page. Covered controls are hidden from accessibility while encryption starts; a background navigator cannot count as ready. Restart checks never interrupt the initial device-key setup. Event opening waits for the previous drawer to close and verifies the title inside the new drawer before editing or deleting; background agenda text cannot satisfy that check. Text replacement focuses the end of the short fixture value before sending Backspace, then checks the complete replacement before saving. iOS email and mailbox/label input wait for each visible prefix before sending the next character; sign-in prefixes must match the email field itself. iOS text is entered as individual character events because the pinned driver sends the remainder at 30 characters per second, which can drop input on the simulator; Android verifies each prefix for identity and category fields and keeps whole-text entry elsewhere. The iOS per-journey limit allows 20 minutes for this paced input, while Android retains 10 minutes. A failed case is recorded and fails the job; there are no retries that turn a failing journey green. Every process restart must reach the authenticated workspace without another sign-in; a persistent sign-in screen fails the wait. Calendar content cases use the date picker to open a fixed Agenda window starting one week before the fixture was seeded, so midnight and timezone changes cannot hide retained records; view switching is asserted separately. A failed authentication/content prerequisite stops dependent cases immediately. Failed Mail setup or recovery stops the conversation cases, and a failed conversation stops the remaining cases. The API always resumes after the offline case. A successful run requires every case, including offline recovery, to execute. Theme, dates and test content are controlled by the journeys rather than a production account's existing data.

Cold-start network validation has a three-second bound after reading the existing Secure Store cache. Slow asynchronous library hydration cannot consume that network budget or hide a valid cached session. A network failure can restore only an unexpired session already cached by Better Auth in Secure Store, with a stored cookie and matching user/session ownership. A server response rejecting the session clears the cache; expired or malformed caches cannot open the workspace, and late responses cannot revive a signed-out session. This uses the existing auth cache and encrypted mailbox snapshot, without another persistent store.

Password sign-in rejects explicit credential errors. Recovery after a lost response requires a changed signed session cookie and the requested account; an existing session alone cannot validate the newly entered password. The first Calendar journey signs out, signs in again and reads the retained default calendars so a broken password envelope fails before dependent content journeys.

The iOS home-screen wait dismisses the system Save Password prompt, including when it appears after authentication. Four bounded 45-second readiness observations preserve the existing three-minute home wait; only system-prompt dismissal and readiness are repeated, never sign-in, application mutations or a failed journey.

A token-only sign-in response also waits for a bounded session refresh before opening the workspace, so Better Auth can finish writing its complete Secure Store cache before an immediate restart. A refresh for another account cannot replace the accepted account, and an unavailable refresh does not reject a password sign-in the server already accepted. Android input waits for the software keyboard to appear; category fields tap the section label to verify blur, then refocus before verifying each typed prefix. Hiding the Android keyboard alone leaves the field focused. Replies wait for recipient layout changes and tap the visible upper editor area, because its accessibility frame can extend behind the keyboard. Before Send, the new reply text must appear below Subject and must not appear in the recipient input.

Mail runtime queries wait for encryption startup before fetching folder names, so a locked placeholder cannot become the fresh cached name after unlock. Restored snapshots stay readable while keys load; once unlocked, a background refresh reopens the current names even when the snapshot is recent. A failed offline refresh keeps the restored data. Complete restored message bodies also seed the reader cache, so a background list refresh cannot discard the body needed for the next offline restart. Shared drawer text/search fields register keyboard focus with the sheet; fields outside a drawer keep their plain native input. Android drawer bounds use the keyboard's screen position so content stays reachable when edge-to-edge leaves the window unresized, without subtracting the keyboard twice from a resized window. The mailbox and label journeys wait for each visible input prefix on iOS and check the complete value before submitting. Mailbox renaming scrolls the inline editor into view after the keyboard opens.

Native push delivery/NSE execution on a real device, associated-domain passkeys, biometric prompts, App Store distribution and external providers are outside simulator coverage. Attachment selection is currently tested through opening/canceling the system picker; attachment delivery is covered by the existing API/component tests rather than this native journey. These boundaries should stay explicit as new journeys are added.

## Evidence and diagnosis

Conversation journeys also upload numeric observations under `reader-timings/`: tap-to-body time, body-assertion duration and its enforced wait budget. These include Maestro/runner overhead and are response/stability checks, not a frame-rate benchmark. Missing timing evidence fails a conversation journey. Raw command arguments, message bodies and account identifiers are excluded from these files.

Each platform uploads `junit.xml`, `results.json`, a Markdown summary and screenshots. Failed journeys also capture a screenshot directly from the device and a minimized accessibility hierarchy with selector fields, bounds and state flags; password nodes and fixture credentials are removed. Native screenshot capture remains available when Maestro cannot read the hierarchy. Failure JSON records only the fixed category, exception class, failed command kind and CLI exit code, reading the private JUnit cause when the console only says the flow failed. It excludes command arguments and raw error messages. Maestro's raw command output and traces, credentials, session data and service databases stay under `private/` and are never uploaded. Regression tests check hierarchy sanitization, command-output isolation, failure classification, evidence export and symlink escapes with secret sentinels. Account credentials are freshly seeded local test values, not the App Review account. Test failures show the case name in the Actions log and the report; screenshots preserve the actual failure screen.

The binary cache covers application/package source, patches, the lockfile, pinned Bun/Node versions, root manifest, build helpers/workflow and runner image/toolchain. Journey-only edits reuse the compiled binaries; app source changes rebuild them. Build artifacts transfer the apps in tar archives to preserve executable bits and framework symlinks, with a regression test for that contract. These archives contain compiled test apps before any account signs in. Maestro 2.12 is checksum-pinned for its driver wait and current Xcode fixes. Each iOS journey reinstalls only the XCTest driver to isolate its state after native pickers and app switches; application data and sign-in remain intact. Android reuses its driver after the first journey. A failed journey remains a failure; driver isolation adds no retries. Native animations remain enabled.

Account switches use the live sign-out UI; the dedicated conversation-reader journey still cold-starts the app and opens its retained thread.

Native startup keeps failed encryption attempts unready and retries transport/server failures with capped backoff while active, or immediately on foreground return. Bootstrap requests time out after ten seconds. Recovery retries mail preparation without clearing already-unlocked account keys or rehydrating the offline snapshot; sign-out and account switches cancel pending attempts. Native runtime typechecks exclude Node globals; separate Jest configs keep Node-based test tooling checked.

## Local execution

The helpers require `SOLACE_E2E=1` and an absolute `SOLACE_E2E_DIR` whose final directory is `solace-e2e`. Use a new temporary directory. Do not share it with another run. Ports 4001, 55432, 58080 and 59000 must be free; macOS also uses SMTP port 2525 and Android uses the isolated emulator port 5580.

Use the repository's pinned Bun, Node and Rust. Linux needs Podman, Android SDK tools and Java 21. macOS needs Xcode 26.6 with iOS 26.5, CocoaPods, Java 21 and Homebrew `postgresql@18`/Python 3.13. The workflow contains the reproducible setup sequence.

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
