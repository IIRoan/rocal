# Plan 005: Security, mail and calendar improvements in one PR

Status: PARTLY DONE (2026-11-14, PR #200). Implemented: S2 (without the `native-release` environment), S3 Part A, S5 (without the GitHub-advisory Contact line), S6, S9, M1–M6, M8–M10, C1–C6, T1, T2, and R1–R3. Still open, waiting on the owner's decisions: S1, S3 Part B, S4, S7 (with R8), S8, M7 and the S2 environment; their sections below remain the specification.

Planned on 2026-11-14 against commit `ee7fb5511647555967242204ed19eef584f66f21` (branch `ui/reduce-encryption-notices`, which is 10 commits ahead of `master` `95fa8e79`). Priority P1–P3 mixed. Effort XL. Rollout risk is HIGH because of S7, S8, M7 and C6.

Deliberately not adopted: OPAQUE with a password-hash fallback, a ratchet with plaintext escrow, a cross-origin passphrase handoff, a server image proxy, a server-side unsubscribe catalog, and a duress PIN that only wipes local state.

Read this whole plan and root `AGENTS.md` before implementing. Then:

1. Branch from `master` after `ui/reduce-encryption-notices` merges, or rebase onto it.
2. Run `git diff --stat ee7fb551..HEAD` and reconcile every `path:line` reference that moved.
3. Keep changes unstaged until the owner asks for commits.
4. Start no deploys, OTA publishes, store builds or Railway changes because of this document. The operator steps below are for the owner.

## Outcome and boundaries

One PR ships 27 items: S1–S9, M1–M10, C1–C6, T1 and T2.

Every API change is additive. Shipped native binaries and OTA bundles keep working, and every migration only adds what the previous deployment ignores.

Where a new client would write data that shipped clients cannot read, the PR ships the reader now and starts writing on a dated gate (see "Dates and gates"). This follows the existing `RAW_PASSWORD_UPGRADE_ENDS` pattern.

**Not in this PR (follow-ups):**
- the mail subscriptions view;
- the `filename:` search operator;
- binding calendar and category names;
- blanking existing server copies of device keys (S4 lists the criteria);
- a nonce-based CSP (S6 explains why);
- mail templates, filters/Sieve, snooze, and mbox/eml import and export;
- i18n, desktop/Tauri, a local CalDAV bridge, tasks and booking pages;
- passkey PRF unlock, native app lock, OPAQUE, and external OpenPGP/WKD.

## Item index

| ID | Item | Effort | Risk | Platforms |
| --- | --- | --- | --- | --- |
| S1 | Sign EAS over-the-air updates | M | med | native, scripts, CI |
| S2 | Isolate release secrets in CI | M | low | CI, Vercel |
| S3 | Envelope KDF: PBKDF2 600k now, Argon2id behind a date | L | med | e2ee, backend, web, native |
| S4 | Stop storing device-wrapped account keys on the server | M | med | e2ee, backend, web, native |
| S5 | `SECURITY.md` and RFC 9116 `security.txt` on all three hosts | S | low | repo, web, API, Stalwart |
| S6 | `script-src-attr 'none'` (nonce CSP not feasible with Cache Components) | S | low | web |
| S7 | Bind event ciphertext to its row id | L | high | e2ee, backend, web, native |
| S8 | Recovery kit plus passkey step-up (closes a Known gap) | L | high | auth, e2ee, backend, web, native |
| S9 | Seal calendar feed URLs | M | med | backend, web, native-calendar |
| M1 | `mailto:`/`tel:` links in received mail | M | med | web, native-mail |
| M2 | Link protection (real host, look-alikes, tracking parameters) | L | med | web, native-mail |
| M3 | Tracker blocking by URL, with a visible count | M | low | web, native-mail |
| M4 | Unsubscribe for any `List-Unsubscribe` mail, on the device | M | med | web, native-mail |
| M5 | Strip photo metadata from outgoing images | M | med | web, native-mail |
| M6 | Vacation responder (JMAP `VacationResponse`) | M | med | web, native-mail, Stalwart |
| M7 | Undo send and scheduled send (JMAP hold) | L | high | web, native-mail, Stalwart |
| M8 | Auto-advance after archive, delete or move | S | low | web, native-mail |
| M9 | Typed mail search operators | L | med | web, native-mail |
| M10 | Configurable swipe actions | M | low | native-mail (web round-trips the setting) |
| C1 | Export a whole calendar as `.ics` on the device | M | med | web, native-calendar |
| C2 | Web keyboard navigation and go-to-date | M | low | web |
| C3 | Calendar search operators | M | low | web, native-calendar |
| C4 | Quick add in plain language | M | med | web, native-calendar |
| C5 | Drag-to-create and resize | L | med | web, native-calendar |
| C6 | Undo and a 30-day trash for deleted events | L | high | backend, web, native-calendar, worker |
| T1 | Property tests for the hostile parsers | M | low | calendar-core |
| T2 | Web end-to-end tests with Playwright plus an axe scan | L | med | e2e, CI |

## Decisions the plan assumes

Each item ends with its own **Decisions** list. These are the ones with the most consequence; overturn them before implementation starts.

| Item | Decision | Default |
| --- | --- | --- |
| S8 | Add a password reset route that is proven with the recovery kit. This replaces "there is no reset route" in AGENTS.md. | Yes |
| S8 | Require passkey step-up to register or delete a passkey, for every account. Accounts with neither a kit nor a passkey left go to support. | Yes |
| S8 | Kit secret format | Base32 groups with a checksum, no new dependency |
| S7 | How unbound (v1) event content is retired | A per-account sweep marker, not a global date (see R8) |
| S6 | Adopt a nonce CSP by turning off Cache Components | No; ship `script-src-attr 'none'` |
| S5 | Security contact | `support@solace.onl` plus GitHub private vulnerability reporting |
| S1 | Signing key | Generated on the owner's machine; 10-year certificate; development builds stay unsigned |
| S2 | Required reviewer on the `native-release` environment | No; branch restriction only |
| M1 | Web link handling | Opaque `/mail/link#<id>` handoff over `BroadcastChannel`; no `registerProtocolHandler` (it puts addresses in a query string) |
| M4 | One-click unsubscribe | Native POSTs itself; web submits a form from `/mail/link` (route-only `form-action https:`, never `connect-src`); only for DKIM-pass mail, after a confirm |
| M7 | Undo window; holds for external recipients | 5 s; scheduled external sends capped at 24 h, with a notice |
| M8 | Auto-advance default | Next message |
| C2 | "Today" key | `N` (`T` is the 3-day view) |
| C6 | Trash design | A separate `event_trash` table, not `deleted_at`. Single-occurrence deletes stay permanent. Restore goes to the default calendar when the original is gone. |
| T2 | Browser coverage and axe | Chromium only; fix existing violations instead of allowlisting them |

## Dates and gates

| Constant | Default | Item | Effect |
| --- | --- | --- | --- |
| `SERVER_DEVICE_KEY_COPY_ENDS` | 2027-01-11 | S4 | Clients stop sending server copies of their wrapped device keys |
| `BOUND_EVENT_CONTENT_STARTS` | 2027-01-11 | S7 | Clients write bound (v2) event content |
| `ARGON2ID_ENVELOPE_WRITES_BEGIN` | 2027-04-01 | S3 | New password envelopes use Argon2id |
| `LEGACY_EVENT_CONTENT_ENDS` | removed by R8 | S7 | Replaced by a per-account sweep marker |

Rules for every write gate:
- It must be at least 14 days after the merge.
- For S3 and S7, it must also be at least 30 days after a **store** build of both apps whose *embedded* bundle includes the reader went live. A fresh install runs its embedded bundle before any OTA arrives (`checkAutomatically: "NEVER"`).
- Moving a date later is always safe; moving one earlier is not.
- If the merge or the store builds slip, move the constant in a small follow-up PR before the date arrives.

## Migrations

Create the migrations in this order so their timestamps sort correctly (`cargo xtask migrate new <name>`). Register each one in `apps/backend/src/db/migrations.rs`, then run `cargo xtask entities` once after the last.

| # | Name | Item | Change |
| --- | --- | --- | --- |
| 1 | `password_envelope_argon2id` | S3 | Nullable `kdf_memory_kib` and `kdf_parallelism` on `user_encryption_password` |
| 2 | `user_recovery_kit` | S8 | New table, keyed by user, `ON DELETE CASCADE` |
| 3 | `sealed_feed_url` | S9 | Nullable `encrypted_url` on `calendar_subscription` |
| 4 | `event_trash` | C6 | New table, cascaded from the user, with a retention rule in `apps/notifications/src/retention.rs` |

S4 and S7 need no migration. S4 stores `""` in the existing NOT NULL columns, and S7 reuses `encryption_key_version`.

## Cross-item reconciliation

Several sections were planned in parallel. Where one of the rules below disagrees with a section, **the rule wins**.

- **R1. One search-operator parser.**
  - The name `tokenizeSearchQuery` is already taken (`packages/calendar-core/src/mail-search-relevance.ts:40`, root-exported and used by title search and unified search).
  - The shared parser is therefore `parseSearchQuery(input: string, knownKeys: ReadonlySet<string>): ParsedSearchQuery` in `packages/calendar-core/src/search-query.ts`, root-exported with no subpath. It returns `{ terms: string[]; operators: Array<{ key: string; value: string; negated: boolean }> }`, and a key outside `knownKeys` stays a plain term.
  - `CALENDAR_SEARCH_OPERATOR_KEYS` (C3) and `MAIL_SEARCH_OPERATOR_KEYS` (M9) live beside it, and `hasSearchOperators(parsed)` takes the parsed result.
  - Web unified search parses once with the union of both key sets. A source skips itself when the query carries an operator it does not support.
  - This replaces C3's `tokenizeSearchQuery(input)` with a global `SEARCH_OPERATOR_KEYS`, and M9's `tokenizeSearchQuery(input, keys)`.
- **R2. Sealed settings keep unknown keys.**
  - C2 fixes `sealUserSettings` (`packages/calendar-client/src/calendar-api-service.ts:954`) so it keeps keys it does not know.
  - Apply the same root-cause fix to `sanitizeMailSyncedSettings` (`packages/calendar-core/src/mail-synced-settings.ts:47`) and the group normalizers it calls. Spread the raw group first, then the normalized known fields.
  - Clients from this PR on then preserve each other's future keys. Older binaries still drop them, and the defaults below apply, as each section already notes.
  - Test with a round trip of an unknown key at the top level and inside a group.
- **R3. Settings land once, before the features.** All new preference fields go in one commit, with their normalizers, defaults and tests. The features then only read them.

  | Key | Group | Default | Item |
  | --- | --- | --- | --- |
  | `confirmExternalLinks` | `MailDisplaySettings` | `true` | M2 |
  | `stripImageMetadata` | `MailComposeSettings` | `true` | M5 |
  | `undoSendSeconds` | `MailComposeSettings` | `5` | M7 |
  | `autoAdvance` | `MailListSettings` | `"next"` | M8 |
  | `swipeRight`, `swipeLeft` | `MailListSettings` | today's read / trash | M10 |
  | `keyboardShortcuts` | `user_settings.encrypted_preferences` | absent means on | C2 |

  Mail keys go in the sealed `mail-settings:v1` blob (`MailSyncedSettings`), never in `user_settings`.
- **R4. One owner for the compose send path.** M7 changes the send path first: hold parameters in `buildSendMessageMethodCalls`, `use-mail-app.ts` `handleSendMessage` and `use-compose-send.ts`. M5, M1 and M4 build on it.
  - The M4 mailto unsubscribe bypasses compose and sends immediately, with no undo hold.
  - M1's `seedMailto` uses the same compose request as reply and forward.
- **R5. `apps/web/lib/security-headers.ts` has two edits.**
  - S6 adds `script-src-attr 'none'`.
  - T2 drops `upgrade-insecure-requests` only for an `http:` loopback API origin.
  - M4 does not widen `connect-src`.
  - Both changes are asserted in `apps/web/__tests__/lib/security-headers.test.ts`.
- **R6. One upgrades-report change.** S7 (`eventsWithUnboundContent`) and S9 (`subscriptionsWithReadableUrls`) extend `EncryptionUpgrades` together: one DTO edit, one `cargo xtask openapi` run and one `encryption-upgrade.ts` change.
- **R7. Order inside the E2EE files.** Do S3, S4, S7, S8 in that order.
  - S3 and S4 share `crates/solace-api-types/src/e2ee.rs`, `apps/backend/src/e2ee/service.rs`, the API suite `e2ee.rs`, `E2eeProvider.tsx`, `native-e2ee-provider.ts` and `e2ee-bootstrap.ts`.
  - S7 changes `attachEventEncryptionShadow(request, id)` on every provider and test mock.
  - S8 touches `passkeys.rs`, `one_time_token.rs`, `auth-key-fetch` and the HKDF helper used by notification titles.
- **R8. No hard cutoff for unbound event content.**
  - S7 as written refuses v1 content after `LEGACY_EVENT_CONTENT_ENDS`. An account that stays dormant past that date would then lose every event it never swept: the events would show as read-only placeholders. That is data loss, so do not ship the global cutoff.
  - Instead, when `upgradeStoredEncryption` finds no `eventsWithUnboundContent` left for the account, the client:
    - writes a sealed preference `eventContentBound: true` (in `user_settings.encrypted_preferences`, through R2);
    - stores a device-local marker: `expo-secure-store` on native, the E2EE IndexedDB store on web.
  - A client refuses v1 content once either marker is present. Before that, it opens v1 content and reseals it.
  - Dormant accounts keep their data and are protected once they sweep.
  - Residual risk: a server rolling back the sealed settings blob on a *new* device. This is the same rollback class S7 already lists as out of scope; the local marker covers devices that have already swept.
  - Drop `LEGACY_EVENT_CONTENT_ENDS` and its tests. Keep `contentUnavailable` and the read-only editor guard, which still apply to content that truly fails to open.
- **R9. Trash restores keep ids.** C6 restores rows under the same id and with the same ciphertext, and S7 binds only the stored row id. A restore into the default calendar therefore keeps decrypting. C6 must never give a restored row a new id. S7's bulk-duplicate guard also stays.
- **R10. Shared surfaces.**
  - C4 and C5 share one native `EventSheetMode` `start`/`end` prefill.
  - M3's tracker shield, M4's unsubscribe banner and M8's auto-advance share the reader header and `use-mail-message-actions.ts`.
  - M2's web link check reuses M1's `/mail/link` handoff.
  - M3 uses M2's host helper, and M4 uses M1's mailto parser.
- **R11. Probe Stalwart first.** M6 and M7 depend on behaviour of Stalwart 1.0 that was not verified from source: `VacationResponse`, FUTURERELEASE holds and `undoStatus: "canceled"`.
  - Write `apps/stalwart/tests/probe_jmap_send_features.py` first and run it against the test environment.
  - If a capability is missing, drop that item's UI from the PR and record it as a follow-up. Do not work around Stalwart.

## Implementation order

One PR, reviewed commit by commit. Commit only when the owner asks; this sequence is the suggested split.

1. **Preflight.**
   - Reconcile against `HEAD`.
   - `cargo xtask test-env up`.
   - Run the M6/M7 Stalwart probe (R11).
2. **Process and platform.**
   - S5 (`SECURITY.md`, the three `security.txt` copies and the expiry test).
   - S6 (CSP).
   - S2 (CI secret isolation and the `pinned-workflow-actions` rule).
   - S1 (update signing config, publish wrapper and certificate check).
3. **Shared foundations.**
   - R2 (unknown keys kept).
   - R3 (all settings fields).
   - R1 (`parseSearchQuery`).
   - T1 (property tests). Fix any counterexample here, before the features build on the parsers.
4. **Encryption and auth.**
   - S3 (migration 1), S4, S7 with R8, S9 (migration 3), S8 (migration 2, created before S9's).
   - One `cargo xtask openapi` run at the end of the phase. Add API suite cases for every route change.
5. **Calendar.**
   - C1, C3, C2, C4, C5.
   - C6 (migration 4, retention rule, account deletion, trash UI).
6. **Mail.**
   - M7, then M5, M1, M2, M3, M4 (R4, R10).
   - M6, M8, M9, M10.
7. **Web E2E.** T2, whose journeys exercise C2, C4, C5, C6 and the compose send path.
8. **Docs.**
   - Apply every item's **Docs** block to `AGENTS.md`. The `CLAUDE.md` files are symlinks.
   - Apply the README and `apps/web/AGENTS.md` edits.
   - Re-read §2 and §8 as a whole for contradictions.

## Verification

Run all of the following and record their real output in the PR:
- `cargo xtask check`: fmt, clippy, tests, the whole API suite in both modes, codegen diffs and memory budgets.
- `bun run lint`, including notices. Expect no new shipped dependency; T2 adds dev-only `@playwright/test` (Apache-2.0) and `@axe-core/playwright` (MPL-2.0).
- `bun run typecheck` and `bun run typecheck:native`.
- `bun run test`. If the root run fails locally for the known environment reason, run each workspace's `test` script and the app `react-compiler.test.ts` files.
- `bun run check:rules`, including the new `public-certificates-only` and `pinned-workflow-actions` rules.
- `REACT_DOCTOR_NO_TELEMETRY=1 bun run lint:react-doctor`.
- The T2 suite locally against `cargo xtask e2e serve`, and the Stalwart probe.
- Manual web smoke in Chrome, Firefox and Safari with no CSP violations: the S6 list, plus the M1/M2 link flow, C5 drag, C6 undo and trash, and M7 undo.
- Native: both apps on a simulator for the M and C items. The existing Maestro journeys must still pass in CI.

## Operator steps (owner)

**Before merge:**
1. **S2:** Create the GitHub environment `native-release`, limited to the `master` and `testing` branches. Move `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY` into it and delete the repo-level copies.
2. **S1:** Generate the update-signing key pair. Put the private key in `native-release` as `EXPO_UPDATES_SIGNING_KEY` and in an offline backup. Commit only the `.crt`. If this is missing at merge, the post-merge preview publish fails.
3. **S5:** Enable GitHub private vulnerability reporting, or drop that `Contact` line.

**After merge:**
1. Dispatch an internal build and a preview OTA, and confirm the signed update applies on the new binary.
2. Schedule store builds of both apps early enough for the S3/S7 gate rules.
3. Fetch `/.well-known/security.txt` from `solace.onl`, `api.solace.onl` and `mail.solace.onl`.
4. Confirm that the Stalwart image deploy carried the `backend-gate.cfg` change.
5. Check DKIM on a vacation auto-reply (M6).

**Before each gate date:** confirm its preconditions, or move the constant later.

## PR description must state

- **Single-platform exceptions (AGENTS.md §6), each with its reason:**
  - M10 swipes are native only; web has no swipe rows but round-trips the setting.
  - C2 keyboard shortcuts are web only; native already has go-to-date.
- **Disclosed plaintext:**
  - M6's auto-reply text is stored readable on the mail server.
  - M7's scheduled sends to external recipients wait readable in Stalwart's queue, capped at 24 h.
  - S9 sync requests still carry the feed URL in transit; it is never stored or logged.
- **Known gap closed:** S8 deletes the passkey Known-gap clause from AGENTS.md §2.
- **Follow-ups:** the "Not in this PR" list above, plus S4's cleanup criteria.

---

# Items

Each item uses the same layout: Why, Current state (with `path:line` evidence), Design, Changes, Compatibility, Tests, Docs, Decisions. Where an item disagrees with the cross-item reconciliation above, the reconciliation wins.

## Security, platform and process (S1–S6)

### S1. Sign EAS over-the-air updates
**Effort** M · **Risk** med · **Touches** packages/native-core, scripts, scripts/repo-rules, CI (expo-update.yml, pr-tests.yml, native-checks.yml), app READMEs, AGENTS.md

**Why.** Today anyone holding `EXPO_TOKEN` can push JavaScript to every installed Calendar and Mail binary on any channel, production included. Once expo-updates code signing is on, a binary only runs updates signed by a key that lives outside Expo, so a leaked token alone can no longer ship code.

**Current state.**
- `packages/native-core/expo-config.cjs:95-100`: the `updates` block has `enabled: !isE2e`, `checkAutomatically: "NEVER"`, `fallbackToCacheTimeout: 0` and `url`. It has no `codeSigningCertificate` or `codeSigningMetadata`. `isDev`/`isE2e` are set at :23-24. Development builds include `expo-dev-client` (:134), which loads any bundle URL anyway.
- expo-updates `58.0.21`. iOS enforcement:
  - `node_modules/expo-updates/ios/EXUpdates/CodeSigning/CodeSigningConfiguration.swift:61-99`: a missing signature is rejected (`SignatureHeaderMissing`) unless `allowUnsignedManifests`, and a keyid mismatch is rejected (`KeyIdMismatchError`).
  - `CertificateChain.swift:76-77`: the embedded certificate's validity is checked on every update. **After it expires, every OTA is rejected.**
  - `UpdatesConfig.swift:307`: the config is built with `try?`. **A malformed certificate silently disables enforcement**, so CI must parse it.
- eas-cli `24.6.0` (`packages/native-core/expo-apps.json` `easCliVersion`), `build/utils/code-signing.js` `getCodeSigningInfoAsync`:
  - Once the config has a certificate, it throws `Must specify --private-key-path argument to sign update for code signing`. Publishing fails closed.
  - It reads the certificate path relative to the process cwd. `scripts/native-publish-update.ts:101` spawns with `cwd: appDirectory`.
  - `update:republish`, `update:rollback`, `update:roll-back-to-embedded` and `update:revert-update-rollout` take `--private-key-path` too.
- `scripts/native-publish-update.ts:26` refuses `--channel/--branch/--environment/--auto` passthrough. :86-93 builds the `eas update` args. :52-76 re-enters itself through `eas env:exec` and inherits `process.env`.
- `.github/workflows/expo-update.yml:73-104` publishes. Profiles come from `scripts/native-release-config.ts:16-21`:
  - PR → `development`
  - push to master → `preview`
  - push to `testing` → `testing`
  - dispatch → any profile, including `production` (channel `master`)
- `.p8`/`.pem` cannot be committed:
  - `scripts/repo-rules/repository.ts:22` `PRIVATE_KEY_FILE = /\.(p8|pem|key|p12|pfx|jks|keystore|ppk|private)$|…/`, used by rule `no-committed-secrets` (:92-108).
  - `.gitignore:44` `*.pem`, mirrored into `.easignore` (enforced by `scripts/tests/easignore.cjs`).
  - `.crt` matches neither.

**Design.**
- **Which variants sign:** every non-development, non-E2E variant: `preview`, `testing`, `testflight` (APP_VARIANT preview) and `production`.
  - Development builds stay unsigned: the dev client already runs any Metro URL, so signing protects nothing there. This also keeps PR jobs (development only) free of the key.
  - E2E builds have updates disabled and stay unsigned.
- **Config, in one place.** Add to `packages/native-core/expo-apps.json`:
  `"updatesCodeSigning": { "codeSigningCertificate": "../../packages/native-core/certs/expo-updates-2026-11.crt", "codeSigningMetadata": { "keyid": "solace-2026-11", "alg": "rsa-v1_5-sha256" } }`.
  - The path is relative to each app's project root, like the NSE plugin path at `expo-config.cjs:164`.
  - `rsa-v1_5-sha256` is the only algorithm expo-updates supports.
  - The dated keyid and file name make a rotation change the expo config, so the strict native fingerprint changes and new binaries build.
- **Public certificate.** Commit the PEM *certificate* as `packages/native-core/certs/expo-updates-2026-11.crt`.
  - `.crt` passes `no-committed-secrets` and `*.pem`. No allow-comment is needed, and the rule is not weakened.
  - A new repo rule `public-certificates-only` refuses any `.crt`/`.cer` file whose text contains `PRIVATE KEY`, so a misnamed key cannot slip through.
- **Generate the key pair** on the operator machine (decision D1):
  `cd apps/native-calendar && bunx expo-updates codesigning:generate --key-output-directory ~/.config/solace/expo-updates-2026-11 --certificate-output-directory <scratch dir> --certificate-validity-duration-years 10 --certificate-common-name "Solace"`.
  - Rename `certificate.pem` to the `.crt` path above.
  - Do **not** run `codesigning:configure`: it rewrites static app config, and ours is dynamic.
  - 10 years, because installed binaries reject all OTAs once their certificate expires.
- **Where the private key lives:**
  - A GitHub Actions **environment** secret `EXPO_UPDATES_SIGNING_KEY` (PEM text) in the `native-release` environment from S2.
  - The operator's `~/.config/solace/expo-updates-2026-11/private-key.pem` (mode 600).
  - One offline backup (password manager).
  - **Never** an EAS env var: `eas update --environment` loads EAS env into the bundling process, and anyone with an Expo token can read it.
  - **Never** the repo.
  - Losing the key means no OTA until new binaries with a new certificate ship.
- **How publishes sign.** `publishNativeUpdate` reads the key path from `SOLACE_UPDATE_SIGNING_KEY_PATH`.
  - A new exported pure helper `updateSigningArgs(appVariant: string | undefined, keyPath: string | undefined): string[]`:
    - returns `[]` for `development`;
    - otherwise requires a non-empty path to an existing file and returns `["--private-key-path", keyPath]`;
    - otherwise throws `Signed updates need SOLACE_UPDATE_SIGNING_KEY_PATH (the expo-updates private key)`.
  - Call it right after `readEasUpdateTarget` (:36-42) with `target.env.APP_VARIANT`, so the run fails before `eas env:exec`. Append the result in the args at :86-93.
  - Add `--private-key-path` to the refused passthrough flags at :26, so the env var is the only source.
- **Rotation procedure** (scheduled, or after suspected key compromise):
  1. Generate a new pair with a new date suffix.
  2. In one PR: add the new `.crt`, point `updatesCodeSigning` at it with the new keyid, and bump `version` in `packages/native-core/expo-apps.json`. The `appVersion` runtime then changes, so new-certificate binaries never share a runtime with old-certificate binaries. One update can carry only one signature.
  3. Replace `EXPO_UPDATES_SIGNING_KEY` in the `native-release` environment when that PR merges, and update the operator file.
  4. Old-runtime binaries keep their last update, as on any version bump. Keep the old key in the offline backup for emergency publishes to the old runtime: check out the old commit and set `EAS_UPDATE_RUNTIME_VERSION`.
  5. expo-updates has no revocation. After a compromise, old binaries stay exposed to "stolen key **plus** `EXPO_TOKEN`" until users install the new build, so rotate `EXPO_TOKEN` too.
- **Rollout:**
  - Binaries built before this PR have no embedded certificate. They ignore signatures (they send no `expo-expect-signature`), so signed publishes stay compatible with them, but they get no protection until users update.
  - Enforcement starts per binary, with the first internal, TestFlight or store build after merge. The config change alters the strict fingerprint, so `mobile-internal-build.yml` rebuilds internal binaries on the merge push. A store build still needs an explicit dispatch.
  - Unsigned updates already on a channel are rejected by new binaries, which keep their embedded bundle until the next signed publish.
  - From the merge on, **every** non-development publish must sign; eas-cli enforces this.
  - The `native-release` environment and its secret must exist **before merge**, or the post-merge preview publish fails.

**Changes.**
- packages/native-core:
  - `expo-apps.json`: add `updatesCodeSigning` (above).
  - `expo-config.cjs:95-100`: add `...(isDev || isE2e ? {} : settings.updatesCodeSigning)` inside `updates`.
  - New `certs/expo-updates-2026-11.crt`.
- scripts:
  - `native-publish-update.ts`: add `updateSigningArgs`, the `--private-key-path` refusal, and the args wiring.
  - Update the usage text at :9.
- scripts/repo-rules:
  - `repository.ts`: new rule `{ id: "public-certificates-only", summary: "Committed certificates hold only public material.", files: (f) => /\.(crt|cer)$/.test(f), check: (file) => matchLines(file, /PRIVATE KEY/, () => "a committed certificate must not contain a private key"), examples: { path: "packages/native-core/certs/x.crt", bad: ["-----BEGIN PRIVATE KEY-----"], good: ["-----BEGIN CERTIFICATE-----"] } }`.
  - List it in `scripts/repo-rules/README.md`.
- CI:
  - `.github/workflows/expo-update.yml` publish job, step "Publish to the build profile's channel" (:100-104). Add `EXPO_UPDATES_SIGNING_KEY: ${{ secrets.EXPO_UPDATES_SIGNING_KEY }}` to the step env, and run:
    `set -euo pipefail; if [ "$PROFILE" != development ]; then umask 077; key="$RUNNER_TEMP/expo-updates-key.pem"; trap 'rm -f "$key"' EXIT; printf '%s\n' "$EXPO_UPDATES_SIGNING_KEY" > "$key"; export SOLACE_UPDATE_SIGNING_KEY_PATH="$key"; fi; unset EXPO_UPDATES_SIGNING_KEY; bun run ./scripts/publish-update.ts …`
  - S2 adds the job's `environment:`.
  - New `scripts/tests/expo-updates-signing.cjs` (plain Node, like `native-fingerprint.cjs`). It reads `expo-apps.json`, resolves the certificate from `apps/native-calendar`, and checks that:
    - `new X509Certificate(pem)` parses;
    - the text has no `PRIVATE KEY`;
    - `validTo` is more than 2 years away;
    - the EKU includes code signing `1.3.6.1.5.5.7.3.3` (expo's `isCodeSigningCertificate`);
    - the metadata is `{ keyid: /^solace-\d{4}-\d{2}$/, alg: "rsa-v1_5-sha256" }`.
  - Run it in `pr-tests.yml` (after :70) and `native-checks.yml` (after :34).

**Compatibility.**
- Shipped binaries ignore signatures, so nothing breaks for them.
- No API or DB change.
- E2E builds are unchanged: no signing config, updates still disabled.
- The screenshot workflow builds a production-variant simulator app with the certificate embedded but publishes nothing, so no change there.

**Tests.**
- `packages/native-core/src/lib/expo-config.test.ts`: new `it.each(["calendar","mail"])` checks that `production` (default env) and `{ APP_VARIANT: "preview" }` carry `updates.codeSigningCertificate`/`codeSigningMetadata` equal to `expo-apps.json` `updatesCodeSigning`, and that `{ APP_VARIANT: "development" }` and the existing E2E env (:165-190) carry neither.
- New `scripts/tests/native-publish-update.test.ts` (bun test), wired in `pr-tests.yml` beside `app-store-release.test.ts` (:72). Cases for `updateSigningArgs`: development → `[]`; preview without a path → throws; a missing file → throws; an existing temp file → the flag pair.
- The repo-rule examples self-test.
- `scripts/tests/expo-updates-signing.cjs` (above).

**Docs.**
- AGENTS.md §9: "Native OTA wrappers share `scripts/native-publish-update.ts`; keep build-profile validation there." → "Native OTA wrappers share `scripts/native-publish-update.ts`; keep build-profile validation and update signing there: every non-development update is signed with the key at `SOLACE_UPDATE_SIGNING_KEY_PATH` (the `native-release` GitHub environment in CI, never EAS env or the repo), whose public certificate is `expo-apps.json` `updatesCodeSigning`."
- AGENTS.md §2 Secrets (line 60): after "keys (`.p8`, `.pem`)" add "(public certificates are committed as `.crt`, checked by `public-certificates-only`)".
- `apps/native-calendar/README.md` OTA section (~:195-230) and `apps/native-mail/README.md`: export `SOLACE_UPDATE_SIGNING_KEY_PATH`; pass `--private-key-path` to republish and rollback commands; add the rotation procedure (in Calendar's README, with Mail's linking to it).

**Decisions.**
- D1 Who generates the key. Default: the implementing agent runs the generate command on the owner's machine. The private key goes only to `~/.config/solace/expo-updates-2026-11/` (outside the repo). The owner loads it into the `native-release` environment and an offline backup before merging.
- D2 Sign development too? Default: no (dev clients load arbitrary bundles).
- D3 Certificate validity. Default: 10 years, with expiry checked by CI more than 2 years ahead.

### S2. Isolate release secrets in CI
**Effort** M · **Risk** low · **Touches** CI (expo-update.yml, mobile-internal-build.yml, mobile-store-build.yml, mobile-store-release.yml, app-store-screenshots.yml), apps/web/vercel.json, scripts/repo-rules, GitHub settings

**Why.** Release credentials can publish code to users or submit App Store builds:
- `EXPO_TOKEN`
- the new OTA signing key
- `ASC_*`
- the R2 `S3_*` keys and the Discord webhook

Today some of these sit in jobs, or appear at steps, where `bun install` lifecycle scripts and third-party build code run. A dispatch from any branch also runs that branch's edited workflow file with the repo's secrets.

**Current state.**
- Actions are already SHA-pinned to Chainguard forks in every workflow (`.github/SECURITY-SCANNING.md:33`). Every workflow already declares top-level `permissions: contents: read`. Every install already uses `--frozen-lockfile`. Nothing to do on those three.
- `expo-update.yml:94-99`: the `expo-expo-github-action` step with `token: ${{ secrets.EXPO_TOKEN }}` runs **before** `bun install --frozen-lockfile`. From that step on, the token is available, so dependency lifecycle scripts run with it.
- `mobile-internal-build.yml`:
  - `:112-114` (ios) and `:188-190` (android) put `EXPO_TOKEN` in **job-level** `env`, so every step sees it, including `bun install` (:127-128, :217-218).
  - R2 credentials (`S3_*`, :148-177, :240-253) are used inside the same jobs that ran `eas build --local`. Earlier steps there run arbitrary project and third-party code (prebuild plugins, CocoaPods, Gradle) and can tamper with files that later steps execute.
  - The `publish` job (:255-327) holds `S3_*` and `DISCORD_WEBHOOK` without running `bun install`.
- `mobile-store-build.yml:73-93`: install runs before the Expo step (good). `eas build --local` then runs prebuild, pods and xcodebuild **in the same process** that downloads EAS-managed signing credentials and the remote build number. `eas submit` (:99-103) uses EAS-stored App Store credentials, so no `ASC_*` there.
- `mobile-store-release.yml:356-380`:
  - `ASC_*` live in repo secrets.
  - The "default branch only" check (:360-365) is inside the workflow file, so a dispatch from another branch runs that branch's version of the file.
  - `bun install` (:370) installs everything, although `scripts/app-store-release.ts` imports only `node:*`, `expo-apps.json` and `@workspace/calendar-core/zod`.
- `app-store-screenshots.yml:40-50`: install before the Expo step (good). It uses `EXPO_TOKEN` only for `eas env:exec production`.
- Checkouts in the secret-holding jobs leave `persist-credentials` at its default, so the read-only `GITHUB_TOKEN` stays in `.git/config`. `sync-mail-vps.yml:68-70` already sets it to `false`.
- `apps/web/vercel.json` `installCommand: "cd ../.. && bun install"` has no `--frozen-lockfile`.
- Bun runs dependency lifecycle scripts only for its built-in trusted list (no `trustedDependencies` in `package.json`).
- **What cannot be split (checked in eas-cli 24.6.0):**
  - `eas update --skip-bundler --input-dir <dir>` exists (`build/commands/update/index.js:73-81,197-220`). But the publish step still evaluates the app config: `build/project/expoConfig.js:31-40` spawns the project's own `expo config --json` whenever `expo` is installed, which loads every config plugin from `node_modules`. The signer must also trust whatever bundle the unprivileged job hands it. A split moves only Metro/Babel out of the key's job, so it is not worth the artifact plumbing.
  - `eas build --local` cannot be split without replacing EAS-managed signing (credentials, remote versioning, local build plugin in one run).

**Design.**
- **Credentials appear only after code-running setup, and only in the step that needs them:**
  - In `expo-update.yml`, move `bun install` above the Expo step.
  - In `mobile-internal-build.yml`, delete the job-level `EXPO_TOKEN` env. The Expo step's `token:` input already authenticates the later `eas build` step.
- **GitHub environment `native-release`** (operator step in repo settings):
  - Deployment branches: `master` and `testing`.
  - Secrets: `EXPO_UPDATES_SIGNING_KEY` (S1), and `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` moved out of repo secrets, then deleted there.
  - Used by:
    - the `expo-update.yml` publish job through `environment: ${{ needs.meta.outputs.profile != 'development' && 'native-release' || '' }}`. An empty name means no environment, so PR/development publishes still run. If GitHub rejects the empty-name expression, split into `publish` (development) and `publish-signed` (others).
    - the `mobile-store-release.yml` `release` job, as `environment: native-release`.
  - The branch policy is enforced by GitHub before any secret is exposed, which an in-workflow `test "$GITHUB_REF" = …` cannot do.
  - `EXPO_TOKEN` stays a repo secret: PR internal builds and development updates need it, and Expo tokens cannot be scoped per channel. S1 removes its power over signed binaries.
- **R2/Discord credentials leave the build jobs.**
  - `ios` and `android` upload `solace.ipa` and `ios-meta.json` (`{ bundleId, bundleVersion }` from the existing PlistBuddy lines :164-169), and `solace.apk`, as artifacts `${{ matrix.app }}-ios` / `${{ matrix.app }}-android` with `retention-days: 1`.
  - The existing `publish` job downloads them with `chainguard-actions/actions-download-artifact@d0056a87e7a5e15c79b2dc00f9a66d1aaf86907d # v8.0.2` (already used in `native-e2e-journeys.yml:66`), each step guarded by `if: needs.ios.result == 'success'` / android. It then runs `publish-ios.ts` / `publish-android.ts` before `publish-page.ts`.
  - That job runs no `bun install`: `scripts/internal-release/*.ts` use only Bun built-ins and repo-relative imports.
  - These ad-hoc builds are already public through R2's install page, so a 1-day artifact adds no exposure.
- **`mobile-store-release.yml`:** `bun install --frozen-lockfile --ignore-scripts` (only zod is needed).
- **Checkouts:** `persist-credentials: false` on checkout in every job that receives a secret:
  - expo-update `publish`
  - internal `ios`, `android` and `publish`
  - store `build`
  - store-release `release`
  - screenshots `capture`
- **Vercel:** `installCommand: "cd ../.. && bun install --frozen-lockfile"`.
- **New repo rule `pinned-workflow-actions`** (AGENTS §10: mechanical rules become rules): every `uses:` in `.github/workflows/*.yml` is either a local `./` workflow or `@<40 hex>`. Examples: bad `uses: actions/checkout@v4`; good `uses: chainguard-actions/actions-checkout@37298d8de412b35988dd165ffae45f45b329d365 # v7.0.1`.
- **Honest residue:** `eas build --local` (store and internal) and `eas update` still run project and third-party code beside `EXPO_TOKEN`, and `eas update` runs it beside the signing key. The bundle a signed publish ships is only as trustworthy as the lockfile.

**Changes.**
- CI: `expo-update.yml` (step order, `environment`, `persist-credentials: false`, plus the S1 signing step).
- CI: `mobile-internal-build.yml` (drop :113 and :189, move the R2 steps into `publish`, artifacts, `persist-credentials: false`).
- CI: `mobile-store-build.yml` (`persist-credentials: false`).
- CI: `mobile-store-release.yml` (`environment: native-release`, `--ignore-scripts`, `persist-credentials: false`).
- CI: `app-store-screenshots.yml` (`persist-credentials: false`).
- `apps/web/vercel.json`.
- `scripts/repo-rules/repository.ts`: `pinned-workflow-actions`, listed in `scripts/repo-rules/README.md`.
- GitHub settings (operator): create the `native-release` environment and move `ASC_*` into it.

**Compatibility.**
- No app, API or OTA effect.
- Behavior change: a dispatch of `preview`/`testing`/`production` OTA from a feature branch now fails at the environment gate. Test feature branches with `development` or with a local `bun run update:preview` using the operator key.

**Tests.**
- The `pinned-workflow-actions` examples self-test.
- `bun run check:rules` over current workflows; all already comply.
- Manual: one `workflow_dispatch` of `mobile-internal-build.yml` (preview) and `expo-update.yml` (preview) after merge. Check that the install page and QR still publish, and that the signed update applies on a new internal build.

**Docs.**
- AGENTS.md §9, after "…EAS Submit uploads that exact `.ipa`.", add: "Release secrets (`EXPO_UPDATES_SIGNING_KEY`, `ASC_*`) live in the `native-release` GitHub environment (master and testing only); jobs install dependencies before any credential step, and R2/Discord credentials stay in the job that runs no project build."
- `.github/SECURITY-SCANNING.md:33`: add one sentence about the environment and the `pinned-workflow-actions` rule.

**Decisions.**
- D1 Require a reviewer on `native-release`? Default: no (single maintainer). Branch restriction only.
- D2 Split `eas update` export/publish? Default: no (see "cannot be split").

### S3. Password envelope KDF (A: PBKDF2 600k now; B: Argon2id, read now, write from a gate date)
**Effort** L · **Risk** med · **Touches** packages/e2ee, packages/calendar-core (types), packages/native-core, apps/web, crates/solace-api-types + apps/backend (+ migration, openapi), packages/api-contracts, crates/solace-api-tests

**Why.** The envelope is what someone with a database copy brute-forces offline. It uses 310k PBKDF2-SHA-256 iterations while the auth key already uses 600k (`packages/e2ee/src/e2ee-module.ts:28,32`). Argon2id is memory-hard, so GPU guessing costs far more. Every client already has a working Argon2id from the mail vault.

**Current state.**
- `packages/e2ee/src/e2ee-module.ts`:
  - `:26-32`: `PASSWORD_KDF_ALGORITHM = "PBKDF2-SHA-256"`, `DEFAULT_PASSWORD_KDF_ITERATIONS = 310000`, `AUTH_KEY_ITERATIONS = 600000`.
  - `:113-132` `assertEnvelopeKdfParameters`: 100k–5M iterations, 16-byte salt. The auth-key salt `solace-auth-key-v1:<email>` is at least 20 bytes, so it cannot be the 16-byte envelope salt, even at equal iterations.
  - `:339-364` `derivePasswordWrappingKey` is PBKDF2 only. Outside the module it is only re-exported (`apps/web/lib/e2ee-crypto.ts:41`) and never called.
  - `:366-405` `createPasswordEnvelope` always uses 310k.
  - `:407-444` `unwrapPasswordEnvelope` **ignores `kdfAlgorithm`**. `PasswordEnvelopeInput` (:62-69) does not include it, so shipped clients given an Argon2id envelope would fail the iteration check and treat it as a wrong password.
- **Every envelope writer goes through `createPasswordEnvelope`, so Part A is one constant:**
  - Web new account: `apps/web/lib/e2ee-bootstrap.ts:208-215` `createInitialDevice`.
  - Web missing-envelope repair: `:367-391` `storePasswordEnvelopeForActiveSession`, called from `unlockWithSignInPassword` :421-431.
  - Web password change: `apps/web/components/command-palette/command-palette-actions.ts:97-110` → `changePasswordWithEnvelope` (`packages/calendar-client/src/password-change.ts:16-26`) → `POST /api/auth/change-password` or `PUT /api/e2ee/password`.
  - Native new account: `packages/native-core/src/providers/E2eeProvider.tsx:281-293`.
  - Native missing-envelope repair: `:100-126` (via `putPasswordEnvelope`, `native-e2ee-provider.ts:305-324`).
  - Native password change: `:338-355` `createPasswordEnvelope` → `AccountSettingsContent.tsx:90-116`.
- **Readers:**
  - Web: `e2ee-bootstrap.ts:246` `activateFromPasswordEnvelope`.
  - `resolveDeviceEnvelopeSalt` (`packages/e2ee/src/device-key.ts:4-30`), on both platforms.
  - Native: `E2eeProvider.tsx:241-246`.
- **Native PBKDF2** runs in OpenSSL through react-native-quick-crypto's `subtle.deriveKey` (`packages/native-core/src/lib/native-crypto-provider.ts:44+`). Sign-in already pays one 600k derivation (the auth key), so a 600k envelope costs about the same again (≈0.3–0.6 s on recent iPhones, unmeasured).
- **Backend:**
  - `apps/backend/src/e2ee/routes.rs:35-43`: `kdfIterations` is `zod::number().int().min(100_000).max(5_000_000).optional()`. `kdfAlgorithm` is any string up to 64 characters.
  - `service.rs:27` default 310_000 (used only when a client omits iterations).
  - `service.rs:181-213` `password_keys` is shared by `PUT /api/e2ee/password` and change-password (`apps/backend/src/auth/passwords.rs:128`).
  - `queries.rs:184-221` upsert.
  - Entity `db/entities/user_encryption_password.rs` (`kdf_iterations i32 NOT NULL`, no Argon2 columns).
  - DTOs `crates/solace-api-types/src/e2ee.rs:67-80` (`PasswordEnvelope`) and `:181-200` (`PasswordEnvelopeRequest`).
- **Argon2id today:**
  - Web: `hash-wasm` ^4.12.0, MIT (`apps/web/package.json:54`), in `apps/web/lib/mail/vault-kdf.ts:1-40` and the mail crypto worker (`apps/web/workers/mail-crypto.worker.ts:6`). The CSP already allows `'wasm-unsafe-eval'` (`apps/web/lib/security-headers.ts:33`).
  - Native: react-native-quick-crypto `argon2Sync` (native), via `packages/native-core/src/lib/load-quick-crypto.ts`, used by `apps/native-mail/src/lib/mail/native-vault-crypto.ts:170-207`, with an `@noble/hashes` (MIT) JS fallback for Jest.
  - Mail vault parameters are m=65536 KiB, t=3, p=4 (`apps/web/lib/mail/account-bootstrap.ts:122-124`, `apps/native-mail/src/lib/mail/account-bootstrap.ts:100-102`).
  - **Native Calendar already links it:** quick-crypto is in `apps/native-calendar/package.json:78` and the shared plugin list (`expo-config.cjs:162`). The lockfile has resolved 1.1.5 since 2026-06-01 (Mail used `argon2Sync` on 1.1.5 from 2026-10-06) and 1.1.9 since 2026-11-09 (#166). **No new native module and no new binary are required. The reader ships by web deploy plus OTA.**

**Design.**
- **Part A (effective at merge):**
  - `DEFAULT_PASSWORD_KDF_ITERATIONS = 600000`. Legacy envelopes keep opening: the 100k–5M range is unchanged.
  - Keep the backend default `service.rs:27` at `310_000`. It describes legacy clients that omit `kdfIterations`, and changing it would mislabel their envelopes.
  - **Opportunistic rewrap, only with a fresh sign-in password** (AGENTS §2). New helper in `packages/e2ee/src/device-key.ts`:
    `export function shouldUpgradePasswordEnvelope(input: { envelope: PasswordEnvelopeInput | null; deviceEnvelopeSalt: string | null | undefined; now?: number }): boolean`.
    - It returns true when `deviceEnvelopeSalt === envelope.kdfSalt`, meaning the envelope is known to hold *this session's* account key. Rewrapping a different key would orphan the envelope's key.
    - It also requires that the envelope is weaker than a new one would be: PBKDF2 below `DEFAULT_PASSWORD_KDF_ITERATIONS`, or any PBKDF2 once `now >= ARGON2ID_ENVELOPE_WRITES_BEGIN`.
    - Callers rewrap through the existing create-and-upload functions, which also remember the new salt.
  - **Native call sites** in `E2eeProvider.bootstrap`:
    - (a) Device-key path: after `resolveDeviceEnvelopeSalt` (:196-210) resolves `salt`, if `pendingPassword` and `shouldUpgradePasswordEnvelope({ envelope: bootstrapData.passwordEnvelope, deviceEnvelopeSalt: salt })`, call `storePasswordEnvelopeForActiveSession({ e2ee, userId, apiBaseUrl, password: pendingPassword })` with a `.catch` → `log.warn`.
    - (b) Envelope path: after `registerDeviceForSession` (:258-272), with `deviceEnvelopeSalt: envelope.kdfSalt`, before `clearPendingAuthPassword`.
  - **Web call site** in `unlockWithSignInPassword` (`e2ee-bootstrap.ts:409-448`):
    - When `result.activated` and an envelope exists, use `deviceEnvelopeSalt = (await getStoredE2eeDevice(userId))?.envelopeSalt`.
    - When `unlockE2eeWithPassword` opened it, use `bootstrap.passwordEnvelope.kdfSalt`.
    - Then `storePasswordEnvelopeForActiveSession(userId, password)` with a caught warning.
  - Other devices' remembered salts go stale exactly as after a password change today: they keep their device key at sign-out until their next sign-in re-checks it.
- **Part B (Argon2id): readers in this PR, writes gated.**
  - **Wire format:**
    - `kdfAlgorithm: "Argon2id"` (new constant `PASSWORD_ARGON2ID_ALGORITHM`).
    - `kdfSalt`: 16 random bytes, base64url, same as now.
    - `kdfIterations` = Argon2 passes.
    - New optional `kdfMemoryKiB` and `kdfParallelism`.
    - Write parameters `PASSWORD_ARGON2ID_PARAMS = { memoryKiB: 65536, passes: 3, parallelism: 4 }` (RFC 9106's second recommended option, and the same as the mail vault).
    - Output is 32 bytes, imported as a non-extractable AES-GCM key. AAD (`account-key:${v}` / `blind-index-key:${v}`) is unchanged.
    - Input is `UTF-8(password.normalize("NFKC"))`, as for PBKDF2.
  - **Client bounds (refused before any derivation, so a hostile server cannot OOM a device or pick weak parameters):**
    - PBKDF2-SHA-256 (or a missing algorithm, for legacy rows): 100k–5M iterations.
    - Argon2id: memory 65536–131072 KiB, passes 3–10, parallelism 1–4.
    - Salt exactly 16 bytes for both.
    - Any other `kdfAlgorithm` → `Password envelope has an unsupported KDF.`
    - Mirror the numbers in the backend with a one-line "Mirrors …" comment, as `AUTH_KEY_*` does.
  - **Provider:**
    - `createE2eeModule(crypto: CryptoProvider, kdf?: { argon2id?: Argon2idDerive })` with `type Argon2idDerive = (password: Uint8Array, salt: Uint8Array, params: { memoryKiB: number; passes: number; parallelism: number }) => Promise<Uint8Array>`.
    - It is an option, not a `CryptoProvider` member, so the web module keeps passing `globalThis.crypto` as is (`e2ee-crypto.ts:24`). Mail's other module instances (`vault-secret.ts:31`, `mail-trust.ts:66`, `auth-client.ts:19`) are unaffected.
    - Unwrapping an Argon2id envelope without `argon2id` throws.
    - Web: `argon2idBytes(password, salt, params)` added to `apps/web/lib/mail/vault-kdf.ts` (hash-wasm, `outputType: "binary"`, `hashLength: 32`). `deriveVaultKeyBytes` is refactored to call it. `e2ee-crypto.ts` lazy-imports it as the `argon2id` option.
    - Native: `argon2id` in `native-crypto-provider.ts` calls `loadQuickCrypto()?.argon2Sync("argon2id", { message, nonce: salt, parallelism, tagLength: 32, memory: memoryKiB, passes })` and throws if the function is missing. There is no noble fallback on Hermes, where 64 MiB of JS Argon2 is far too slow. `E2eeProvider.tsx:96` passes it.
  - **Write gate:** `export const ARGON2ID_ENVELOPE_WRITES_BEGIN = Date.UTC(2027, 3, 1);` in `e2ee-module.ts`.
    - `createPasswordEnvelope` writes Argon2id when `Date.now() >= ARGON2ID_ENVELOPE_WRITES_BEGIN` and the module has `argon2id`; otherwise PBKDF2 600k.
    - Pattern: `RAW_PASSWORD_UPGRADE_ENDS` (`packages/calendar-client/src/auth-key-fetch.ts:20`).
    - The date must be at least 30 days after a store binary of **both** apps whose *embedded* bundle includes the reader is live, because a fresh install signs in on the embedded bundle before any OTA arrives (`checkAutomatically: "NEVER"`). Moving the date later is always safe; moving it earlier is not.
  - `PasswordEnvelopeInput` gains `kdfAlgorithm?: string; kdfMemoryKiB?: number | null; kdfParallelism?: number | null`. `PasswordEnvelopePayload` gains `kdfMemoryKiB?: number; kdfParallelism?: number`.
  - `derivePasswordWrappingKey` leaves the public `E2eeModule` interface (:223-227) and the web re-export (it is unused). The internal function takes the envelope's KDF fields.
- **Server:**
  - Store the parameters in new nullable columns.
  - Validate per algorithm in `password_keys`:
    - Argon2id: iterations 3–10, `kdfMemoryKiB` 65536–131072 and `kdfParallelism` 1–4, both required.
    - PBKDF2: keep "KDF iterations must be at least 100000"; memory and parallelism must be absent.
    - `kdfAlgorithm` must be one of the two values. Shipped clients send `"PBKDF2-SHA-256"` or omit it.
  - The request schema relaxes `kdfIterations` to `.min(1).max(5_000_000)`, and the service enforces the per-algorithm floor.

**Changes.**
- packages/e2ee:
  - `e2ee-module.ts`: constants, types, `assertEnvelopeKdfParameters` per algorithm, KDF dispatch in derive, the `createE2eeModule` option, the gate in `createPasswordEnvelope`.
  - `device-key.ts`: `shouldUpgradePasswordEnvelope`.
  - `index.ts`: export `ARGON2ID_ENVELOPE_WRITES_BEGIN`, `PASSWORD_ARGON2ID_ALGORITHM`, `PASSWORD_ARGON2ID_PARAMS`, `shouldUpgradePasswordEnvelope` and `type Argon2idDerive`.
  - `package.json`: devDependency `"@noble/hashes": "^2.4.0"` (MIT, already in `bun.lock` via both native apps; tests only).
- packages/calendar-core `src/types.ts`:
  - `E2eePasswordRecord` (:495-507): add `kdfMemoryKiB: number | null; kdfParallelism: number | null`.
  - `UpsertE2eePasswordRequest` (:547-555): add the optional fields.
- crates/solace-api-types `src/e2ee.rs`:
  - `PasswordEnvelopeRequest`: add `#[serde(default, rename = "kdfMemoryKiB", skip_serializing_if = "Option::is_none")] #[schema(nullable = false)] pub kdf_memory_kib: Option<i32>` and `kdf_parallelism: Option<i32>` (same attributes, camelCase).
  - `PasswordEnvelope`: add `#[serde(rename = "kdfMemoryKiB")] #[schema(required = true)] pub kdf_memory_kib: Option<i32>` and `#[schema(required = true)] pub kdf_parallelism: Option<i32>`.
- apps/backend:
  - Migration `cargo xtask migrate new password_envelope_argon2id`: `ALTER TABLE user_encryption_password ADD COLUMN kdf_memory_kib integer, ADD COLUMN kdf_parallelism integer` (nullable, no default). Register it in `db/migrations.rs`.
  - `cargo xtask entities`.
  - `e2ee/routes.rs:35-43` schema.
  - `e2ee/service.rs` `password_keys` (per-algorithm checks, `AppError::field` naming `kdfIterations`/`kdfMemoryKiB`/`kdfParallelism`/`kdfAlgorithm`) and `password_record`.
  - `e2ee/queries.rs` `PasswordKeys` + `upsert_password_envelope`: set both columns and add them to `update_columns`, so a PBKDF2 rotation clears them.
  - `cargo xtask openapi` → commit `packages/api-contracts`.
- packages/native-core:
  - `lib/native-crypto-provider.ts`: export `nativeArgon2id`.
  - `providers/E2eeProvider.tsx`: :96 option, and the two upgrade call sites (above).
  - Keep the new branches outside the `try` at :140, or in a module-level helper, so React Compiler 1.0 does not skip the component (AGENTS §5). Mail compiles native-core screens.
- apps/web:
  - `lib/mail/vault-kdf.ts`: `argon2idBytes`.
  - `lib/e2ee-crypto.ts`: module option; drop the `derivePasswordWrappingKey` re-export.
  - `lib/e2ee-bootstrap.ts`: upgrade in `unlockWithSignInPassword`.
- `packages/calendar-client`: no code change (`PasswordEnvelopeRequest` is `Schema<…>` and picks up the new fields).

**Compatibility.**
- Part A:
  - Shipped clients open 600k envelopes; the range check already allows them.
  - Old servers accept 600k.
- Part B:
  - The migration only adds nullable columns, which the previous deployment never selects or writes. Its upsert's `update_columns` leaves them alone, and no Argon2id envelope exists before the gate.
  - Request fields are additive and optional.
  - No client writes Argon2id before `ARGON2ID_ENVELOPE_WRITES_BEGIN`, so deploy overlap and rollback before that date are harmless.
  - After the gate, a rollback to a pre-PR API refuses Argon2id writes (`deny_unknown_fields`, iterations floor) and returns rows without memory parameters, which new clients refuse. Do not roll back past this PR after the gate.
  - A client older than the reader (a store binary without it and no OTA yet) cannot open an Argon2id envelope on a fresh sign-in. It shows `UNLOCK_FAILED_NOTICE`. That is why the gate is tied to store builds.

**Tests.**
- `packages/e2ee/src/__tests__/password-envelope-roundtrip.property.test.ts`:
  - new envelopes report `kdfIterations: 600000` and `kdfAlgorithm: "PBKDF2-SHA-256"`;
  - a 310000 envelope still opens.
  - Keep `numRuns: 20` and the 60 s timeout; lower runs if CI time grows.
- New `packages/e2ee/src/__tests__/password-envelope-kdf.test.ts`:
  - With `jest.spyOn(Date, "now")` past the gate and a module built with `argon2id` from `@noble/hashes/argon2.js`: an Argon2id round trip with the real params (one run).
  - With a stub `argon2id` (a recording mock), checking it is never called for refused params:
    - memory 8192, 262144; passes 1, 11; parallelism 8; salt of 8 and 32 bytes;
    - an unknown `kdfAlgorithm`;
    - Argon2id with no provider;
    - before the gate: PBKDF2 even with a provider.
- `packages/e2ee/src/__tests__/device-key.test.ts`: `shouldUpgradePasswordEnvelope`:
  - a salt mismatch → false;
  - 310k → true;
  - 600k before the gate → false;
  - 600k after the gate → true;
  - Argon2id → false;
  - a null envelope → false.
- `packages/native-core/src/lib/native-crypto-provider.test.ts`: `nativeArgon2id` passes `{ memory: 65536, passes: 3, parallelism: 4, tagLength: 32 }` to a mocked `argon2Sync`, and throws without it.
- `packages/native-core/src/providers/E2eeProvider.test.tsx`:
  - "rewraps a 310k envelope after unlocking from it with the sign-in password" (PUT `/password` with `kdfIterations: 600000`);
  - "does not rewrap when the device key is not the envelope's";
  - "does not rewrap without a sign-in password".
- `apps/web/__tests__/lib/e2ee-bootstrap.test.ts`: the same three cases for `unlockWithSignInPassword`.
- `apps/web/__tests__/lib/mail-vault-crypto.test.ts`: `argon2idBytes` equals `deriveVaultKeyBytes` for the same input (guards the refactor).
- API suite `crates/solace-api-tests/tests/api/e2ee.rs`:
  - `envelope()` (:36-46) gets the new `None` fields.
  - `password_envelope_fields_are_validated` (:609+): update the 99_999 case to the service message, and add Argon2id cases: missing memory → field error; memory 1024 → validation error; PBKDF2 with `kdfMemoryKiB` → field error; `kdfAlgorithm: "scrypt"` → field error.
  - New `an_argon2id_envelope_keeps_its_parameters_and_a_pbkdf2_rotation_clears_them`.
- `crates/solace-api-tests/tests/api/auth_passwords.rs`: in `change_password_stores_the_envelope_for_the_new_password_with_it` (:345), also store an Argon2id envelope through change-password and read it back from bootstrap.
- Rust unit tests in `e2ee/service.rs` for `password_keys` per algorithm.
- `http/contract_tests.rs` picks up the new fields automatically.

**Docs.**
- AGENTS.md §2 (line 36): "and `unwrapPasswordEnvelope` refuses KDF parameters other than a 16-byte salt and 100k–5M iterations, so a server cannot steer the envelope key onto the auth key it receives." → "and `unwrapPasswordEnvelope` refuses a salt other than 16 bytes, PBKDF2-SHA-256 iterations outside 100k–5M and Argon2id parameters outside 64–128 MiB, 3–10 passes and 1–4 lanes, so a server can neither steer the envelope key onto the auth key it receives nor exhaust a device. New envelopes use PBKDF2 600k until `ARGON2ID_ENVELOPE_WRITES_BEGIN`, then Argon2id (hash-wasm on web, quick-crypto on native), and a sign-in whose device key matches an older envelope rewraps it with that sign-in password (`shouldUpgradePasswordEnvelope`)."

**Decisions.**
- D1 Gate date. Default: `Date.UTC(2027, 3, 1)`. Move it later if no store build of both apps with the reader has been live for 30 days by early March 2027.
- D2 Argon2id parameters. Default: m=64 MiB, t=3, p=4 (the mail vault's parameters), read bounds up to 128 MiB/10/4.
- D3 Run web Argon2id in the mail crypto worker? Default: no. The main thread blocks about 0.3–1 s only at sign-in or password change; move it to the worker if that is noticeable.
- D4 Restrict `kdfAlgorithm` to the two values server-side. Default: yes.

### S4. Stop storing device-wrapped account keys on the server
**Effort** M · **Risk** med · **Touches** packages/e2ee, packages/calendar-core (types), packages/native-core, apps/web, crates/solace-api-types + apps/backend (openapi), packages/api-contracts, crates/solace-api-tests

**Why.** Data minimization (AGENTS §2). Current clients never use the server's copy of their RSA-wrapped account and search keys: they unwrap their own local copy. The only reader left is the one-time trust path for native installs from before the local copy existed. That path is also the last place where a malicious server could substitute a key wrapped to a device's public key.

**Current state.**
- `apps/backend/src/e2ee/routes.rs:24-33`: `wrappedAccountKey`/`wrappedSearchKey` are required (`min(1).max(32768)`).
- `service.rs:81-100` `wrapped_keys` (shared with envelopes) requires both.
- `service.rs:102-130` `register_device` stores them; `:229-245` `device_record` returns them in bootstrap.
- `queries.rs:14-22` `DeviceKeys` and `:128-168` `upsert_device` (updates them on conflict).
- Columns `wrapped_account_key`/`wrapped_search_key` are `TEXT NOT NULL` (`db/entities/user_encryption_device.rs`).
- DTOs: `crates/solace-api-types/src/e2ee.rs:162-180` (`RegisterDeviceRequest`) and `:48-64` (`EncryptionDevice`).
- No other server code reads them (grep across `apps/backend`, `apps/notifications`, `xtask`). Account deletion cascades.
- **Senders:**
  - Native `packages/native-core/src/lib/native-e2ee-provider.ts:149-183` `registerDeviceForSession`. Its local writes are at :193-203; `rememberOwnDeviceKeys` runs *after* `E2EE_DEVICE_ID` and `E2EE_PRIVATE_KEY`.
  - Web `apps/web/lib/e2ee-bootstrap.ts:138-150` `uploadDevice`, also used to re-register a local record whose row vanished (:323-334).
- **Readers of the server copy:**
  - Native `unwrapStoredDeviceKeys` (`native-e2ee-provider.ts:262-303`) uses `device.wrappedAccountKey` only when `readOwnDeviceKeys` returns null, then keeps it locally.
  - Web never reads it (`e2ee-bootstrap.ts:105-108` uses `localRecord`).
  - The local copy shipped in #155 (`3c763c34`, 2026-11-03). Native JS older than that reads the server copy on every start.

**Design.**
- **API (additive):** both request fields become optional, both-or-neither.
  - Absent → store `""` in both columns.
  - Present → validated and stored as today (blank → the existing "Wrapped account key is required" field errors).
  - One present without the other → that field error on the missing one.
  - Old rows and old senders keep working byte for byte, so pre-#155 installs keep their one-time trust path.
- **Keep the columns NOT NULL and use the empty string; no migration.** A nullable migration would let a row hold NULL while the previous deployment (deploy overlap, or a rollback) still decodes the column as `String` through its generated entity. Its bootstrap would then fail for every device of that user. AGENTS §3 allows only changes the previous deployment ignores.
- **Response:** `EncryptionDevice.wrapped_account_key/search_key` stay `String`, always written, `""` for devices without a server copy. Doc comment: `/// Empty when the device keeps its wrapped keys only on itself.` No contract break for shipped readers.
- **Clients stop sending after a date:** `export const SERVER_DEVICE_KEY_COPY_ENDS = Date.UTC(2027, 0, 11);` in `packages/e2ee/src/device-key.ts`. Both senders spread `...(Date.now() < SERVER_DEVICE_KEY_COPY_ENDS ? { wrappedAccountKey, wrappedSearchKey } : {})`.
  - A date rather than immediately: in one merge, Vercel can serve the new web before Railway finishes the API. An API rollback to before this PR answers 400 to keyless registrations, so new browsers and devices could not unlock.
  - It must be at least 14 days after merge (move it if merging later).
- **Native write order:** in `registerDeviceForSession`, call `rememberOwnDeviceKeys` *before* writing `E2EE_DEVICE_ID`/`E2EE_PRIVATE_KEY`, with a one-line comment. A kill between those writes then never leaves a key pair whose only wrapped copy was the (now empty) server one. `readOwnDeviceKeys` already matches by `deviceId`, so a stale entry is harmless.
- **Follow-up, not this PR:** blank the existing server copies (`UPDATE user_encryption_device SET wrapped_account_key = '', wrapped_search_key = ''`) and then delete the one-time trust branch in `unwrapStoredDeviceKeys`, once **all** of these hold:
  - (1) `SERVER_DEVICE_KEY_COPY_ENDS` has passed;
  - (2) every runtime that can still receive updates embeds #155: the oldest supported store binary's embedded bundle postdates 2026-11-03, or 90 days have passed since the production OTA that carried #155;
  - (3) `SELECT count(*) FROM user_encryption_device d WHERE NOT EXISTS (SELECT 1 FROM user_encryption_password p WHERE p.user_id = d.user_id)` = 0, so every account with devices can recover through its envelope.
  - It is not safe now: (2) and (3) are unverified, and a pre-#155 install on an account without an envelope would lose its only key. Drop the columns only after no deployed code reads them.

**Changes.**
- crates/solace-api-types `e2ee.rs`:
  - `RegisterDeviceRequest.wrapped_account_key/wrapped_search_key` → `#[serde(default, skip_serializing_if = "Option::is_none")] #[schema(nullable = false)] Option<String>`.
  - Doc comments on `EncryptionDevice`.
- apps/backend:
  - `e2ee/routes.rs:29-30` → `.optional()`.
  - `e2ee/service.rs`: `register_device` resolves the pair, with a small `device_wrapped_keys(account: Option<&str>, search: Option<&str>) -> Result<(String, String), AppError>`. `wrapped_keys` stays for envelopes (key version is handled separately).
  - `cargo xtask openapi` → `packages/api-contracts`.
- packages/e2ee: `device-key.ts` `SERVER_DEVICE_KEY_COPY_ENDS`, exported from `index.ts`.
- packages/calendar-core `types.ts:536-545` `UpsertE2eeDeviceRequest`: `wrappedAccountKey?: string; wrappedSearchKey?: string`.
- packages/native-core `lib/native-e2ee-provider.ts`: request body (:178-183) and write order (:193-203).
- apps/web `lib/e2ee-bootstrap.ts` `uploadDevice` (:138-150). The local record keeps its copy.

**Compatibility.**
- Shipped binaries still send keys and still get stored values back.
- Pre-#155 installs are unaffected.
- No migration.
- Overlap and rollback are safe until `SERVER_DEVICE_KEY_COPY_ENDS`. After that date, rolling the API back past this PR breaks new device registration (400).

**Tests.**
- API suite `crates/solace-api-tests/tests/api/e2ee.rs`:
  - `device()` (:23-34) wraps keys in `Some`.
  - `device_fields_are_validated` (:371+): the missing-field paths become `["deviceId","publicKey"]`; add "only `wrappedAccountKey`" → field error on `wrappedSearchKey`.
  - New `a_device_registers_without_a_server_copy_of_its_keys`: the row holds `""`/`""` (`device_row`), and bootstrap lists the device with empty strings.
  - New `re_registering_without_keys_keeps_no_copy`: a device first registered with keys, re-registered without, ends with `""`.
  - `device_key_material_is_stored_byte_for_byte` (:197) stays unchanged as the legacy guarantee.
- `packages/native-core/src/providers/E2eeProvider.test.tsx`:
  - "registers a device without a server key copy after SERVER_DEVICE_KEY_COPY_ENDS" (`Date.now` spy; PUT `/device` body has no wrapped keys; `E2EE_DEVICE_KEYS` written before `E2EE_DEVICE_ID`);
  - extend "drops the server row of a stored key that no longer opens…" (:859): an empty server copy with no own copy falls through to the envelope.
- `apps/web/__tests__/lib/e2ee-bootstrap.test.ts`: `mockUpsertDevice` receives no wrapped keys after the date and still does before it.

**Docs.**
- AGENTS.md §2 (line 36): after "(native keeps it in `E2EE_DEVICE_KEYS`, trusting the server's copy once on installs from before it)" add "; from `SERVER_DEVICE_KEY_COPY_ENDS` clients send no server copy (`PUT /api/e2ee/device` takes the wrapped keys optionally and stores empty strings without them)".

**Decisions.**
- D1 Date. Default: `Date.UTC(2027, 0, 11)` (at least 14 days after merge).
- D2 Store `""` versus a nullable column. Default: `""` (no migration, overlap-safe).
- D3 Blank existing copies now? Default: no; it is the follow-up above.

### S5. Security disclosure (SECURITY.md + RFC 9116 security.txt)
**Effort** S · **Risk** low · **Touches** repo root, apps/web (public), apps/backend, apps/stalwart, scripts/tests, CI (pr-tests.yml), crates/solace-api-tests

**Why.** Researchers have no documented way to report a vulnerability. The only `security.txt` is on `mail.solace.onl`, it names `postmaster@`, and nothing alerts before its `Expires` lapses.

**Current state.**
- There is no `SECURITY.md` anywhere. `.github/SECURITY-SCANNING.md` covers scanning only.
- `apps/stalwart/backend-gate.cfg:47`, `ft_public_jmap`, has:
  `http-request return status 200 content-type "text/plain; charset=utf-8" lf-string "Contact: mailto:postmaster@solace.onl\nExpires: 2027-08-26T00:00:00.000Z\nPreferred-Languages: en\nCanonical: https://mail.solace.onl/.well-known/security.txt\n" if { path /.well-known/security.txt }`.
- Contact constants in `packages/calendar-core/src/product-info.json`: `supportEmail: "support@solace.onl"`, `issuesUrl`, `sourceUrl: "https://github.com/IIRoan/rocal"`. There is no security-specific address, and none should be invented.
- How the web serves `.well-known` today: `apps/web/app/.well-known/apple-app-site-association/route.ts`, a route handler. `apps/web/public/` has no `.well-known/`. Production web origin: `apps/web/.env.production` `NEXT_PUBLIC_APP_URL=https://solace.onl`.
- Backend: non-OpenAPI routes are added in `apps/backend/src/lib.rs:89-92` (`.route("/api", get(health::root_redirect))`), handlers in `apps/backend/src/health.rs`.
- The API and notifications Docker images copy only `apps/backend`, `apps/notifications`, `crates`, `xtask` and one JSON from packages (`apps/backend/Dockerfile:8-15`, `apps/notifications/Dockerfile:8-13`; notifications compiles the API crate). Railway watch patterns are in `.railway/railway.ts:184-192,245-253`. A file `include_str!`'d from `apps/backend/` needs no Docker or watch change.

**Design.**
- **One RFC 9116 body, identical on all three hosts.** RFC 9116 allows several `Canonical` lines, so one file lists every location:
  ```
  Contact: mailto:support@solace.onl
  Contact: https://github.com/IIRoan/rocal/security/advisories/new
  Expires: 2027-11-01T00:00:00.000Z
  Preferred-Languages: en
  Canonical: https://solace.onl/.well-known/security.txt
  Canonical: https://api.solace.onl/.well-known/security.txt
  Canonical: https://mail.solace.onl/.well-known/security.txt
  Policy: https://github.com/IIRoan/rocal/blob/master/SECURITY.md
  ```
  - `Expires` is under a year ahead, as RFC 9116 recommends.
  - The second `Contact` line depends on D1.
- **Copies:**
  - Web: a static file `apps/web/public/.well-known/security.txt`, the simplest option (no route code). Next and Vercel serve `.txt` as `text/plain; charset=utf-8`; verify with `curl -I` after deploy.
  - API: `apps/backend/security.txt`, served by a new handler `health::security_txt` returning `include_str!("../security.txt")` with `Content-Type: text/plain; charset=utf-8` and `Cache-Control: public, max-age=86400`. Registered beside `/api` in `lib.rs:92` as `.route("/.well-known/security.txt", get(health::security_txt))`, outside OpenAPI like the root redirect.
  - Mail: the `lf-string` at `backend-gate.cfg:47`, replaced by the same body; `postmaster@` stays the RFC 2142 mailbox but is not the security contact.
  - Three copies sit in three deploy units. **One test fails on drift and on a near expiry**, so the file can never lapse silently.
- **`SECURITY.md` (repo root; GitHub's Security tab shows it).** Sections:
  - **Reporting:** email `support@solace.onl` with "Security" in the subject, or a GitHub private advisory. Never a public issue (`issuesUrl` is public). Include affected component, steps, impact, and whether you accessed anyone else's data.
  - **Scope:**
    - `solace.onl` web app, `api.solace.onl`, public JMAP `mail.solace.onl`, and `mx.solace.onl` SMTP/relay;
    - the Solace Calendar and Solace Mail iOS apps;
    - this repository's code, including E2EE design flaws (the server learning user content counts as in scope).
  - **Out of scope:**
    - volumetric DoS and load testing;
    - social engineering and physical attacks;
    - findings that need a rooted or jailbroken device or a compromised OS;
    - missing headers or best practices without a demonstrated impact;
    - SPF/DMARC on non-mail domains;
    - self-XSS;
    - reports that only repeat the documented known gaps and accepted trade-offs in AGENTS.md §2 (plaintext `EventParticipant` email and name, and the listed "Known gaps");
    - third-party services (Railway, Vercel, Expo, Apple);
  - **Response targets** (D2): acknowledge within 5 business days, assessment within 14 days, fix critical issues within 30 days. Coordinated disclosure after a fix or 90 days. Credit on request. No bounty.
  - **Safe harbour:** good-faith research under this policy is authorized and will not be pursued legally, provided you:
    - use only accounts you own or have permission to test;
    - stop and report as soon as you reach anyone else's data, without keeping, sharing or changing it;
    - avoid degrading the service;
    - give us reasonable time before disclosure.

**Changes.**
- New `SECURITY.md`.
- New `apps/web/public/.well-known/security.txt`.
- New `apps/backend/security.txt`.
- `apps/backend/src/health.rs`: `security_txt`; update the module doc line 1 ("Health and root routes: …") to mention security.txt.
- `apps/backend/src/lib.rs:92`: the route.
- `apps/stalwart/backend-gate.cfg:47`: the new body as `lf-string` (with `\n` separators).
- New `scripts/tests/security-txt.test.ts` (bun test), wired in `pr-tests.yml` beside :72.

**Compatibility.**
- Purely additive. HAProxy picks the change up with the next Stalwart image deploy (`apps/stalwart/**` watch). The web and API copies deploy with their apps.

**Tests.**
- `scripts/tests/security-txt.test.ts`:
  - reads the web and API files and extracts the HAProxy `lf-string` from `backend-gate.cfg` (regex on the `if { path /.well-known/security.txt }` line, `\n` unescaped);
  - asserts all three are byte-identical;
  - asserts `Contact`, `Expires` (exactly once), `Canonical` and `Policy` are present;
  - asserts `Expires - Date.now() >= 60 days` (message: "security.txt expires within 60 days; move Expires forward in all three copies") and `<= 366 days`.
  - This deliberately fails CI 60 days before expiry.
- API suite: new `security_txt_is_served_as_plain_text` in `crates/solace-api-tests/tests/api/edges.rs` (next to `health_and_root_routes`, :34). Anonymous `GET /.well-known/security.txt` → 200, `content-type: text/plain; charset=utf-8`, body starts with `Contact: `, and it carries the security headers (`assert_security_headers`, as at :65-86).
- Rust unit test in `health.rs`: the body contains `Canonical: https://api.solace.onl/.well-known/security.txt`.

**Docs.**
- AGENTS.md §1 `apps/web` row: "…and the native-passkey association at `/.well-known/apple-app-site-association`" → "…, the native-passkey association at `/.well-known/apple-app-site-association` and the RFC 9116 `/.well-known/security.txt` (also served by the API and mail gateway; `SECURITY.md`; `scripts/tests/security-txt.test.ts` keeps the copies equal and unexpired)".
- `apps/web/AGENTS.md`: one sentence after the AASA paragraph.

**Decisions.**
- D1 GitHub private vulnerability reporting: enable it and list the advisory URL as a second `Contact`? Default: yes. If not enabled, drop that line.
- D2 Response targets. Default: the ones above, for a single maintainer.
- D3 Dedicated `security@solace.onl` mailbox? Default: no, use `supportEmail` (do not invent addresses).
- D4 Sign security.txt with OpenPGP or add an `Encryption:` line? Default: no (no published security key).

### S6. Remove `'unsafe-inline'` from the web script-src
**Effort** S · **Risk** low · **Touches** apps/web (security-headers, tests), AGENTS.md

**Why.** `'unsafe-inline'` lets any HTML injection run script. The question is whether Next 16 lets this app drop it.

**Current state.**
- `apps/web/lib/security-headers.ts:33`: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (plus `'unsafe-eval'` in dev).
- Line 1 records the earlier decision: "No nonces: static Cache Components shells cannot carry one and App Router streams RSC inline." (`871c024f`, 2026-09-15.)
- Headers are set statically via `next.config.ts:26-28` `headers()` → `buildSecurityHeaderRoutes`. There is no `proxy.ts` (Next 16's renamed middleware).
- `apps/web/next.config.ts:21-22`: `cacheComponents: true` and `partialPrefetching: true`. No page uses `"use cache"`, `headers()`, `cookies()` or `connection()`, so every route, `/privacy`, `/licenses`, `/support` and `/login` included, is a prerendered static shell.
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (Next 16.4.3):
  - a nonce "**must use dynamic rendering**";
  - "**Partial Prerendering (PPR) is incompatible** with nonce-based CSP since static shell scripts won't have access to the nonce".
- `.../next-config-js/partialPrefetching.md`: `partialPrefetching` requires `cacheComponents`; "Both features will be enabled everywhere in the next major release, and the options will be removed."
- `node_modules/next/dist/server/app-render/use-flight-response.js:127-128`: RSC payloads are inline `<script>` tags, nonce'd only when a nonce exists at render time.
- Experimental `sri` covers external chunks, not these inline payloads.
- Other inline script: `next-themes` (`packages/ui/src/providers/theme-provider.tsx`). Its script content is deterministic, and it accepts a `nonce` prop.
- No inline event-handler attributes anywhere:
  - grep for `onload=`/`onerror=`/`setAttribute("on` in `apps/web` and `packages/ui` is empty;
  - React never serializes handlers;
  - the only `dangerouslySetInnerHTML` is the sanitized signature at `compose-dialog.tsx:993`;
  - the mail reader is a sandboxed `srcDoc` with its own meta CSP (`packages/calendar-core/src/mail-html.ts:312`).
- WASM (hash-wasm) needs `'wasm-unsafe-eval'`. Workers fall under `worker-src 'self' blob:`.
- Tests: `apps/web/__tests__/lib/security-headers.test.ts`.

**Design.**
- **Verdict:** dropping `'unsafe-inline'` needs nonces, which need per-request rendering of every HTML document. That means turning off `cacheComponents` and `partialPrefetching`, and adding `apps/web/proxy.ts` plus `await connection()` in the root layout and a `nonce` prop on `ThemeProvider`. The costs:
  - every page becomes a Vercel function render;
  - no CDN HTML;
  - routes lose Partial Prefetching;
  - it works against Next's stated direction (Cache Components mandatory next major), so the change would have to be undone at the next upgrade.

  Not recommended for this PR (D1).
- **Ship the closest compliant hardening instead: `script-src-attr 'none'`.**
  - CSP Level 3 checks inline event-handler attributes against `script-src-attr` when it is present. `'unsafe-inline'` in `script-src` then no longer allows `<img onerror=…>`-style payloads, the usual HTML-injection vector.
  - Scripts inserted through `innerHTML` never execute anyway.
  - React 19 already neutralizes `javascript:` URLs.
  - Support: Chrome 75+, Firefox 108+, Safari 15.4+. Older browsers ignore the directive and keep today's behavior.
- Leave `style-src` alone.
- **Enforce directly; no report-only phase.**
  - `Content-Security-Policy-Report-Only` helps only with a reporting endpoint. Reports carry `document-uri`/`blocked-uri`, and AGENTS §2 forbids sending URL-bearing reports anywhere without redaction, so there is no `report-uri`/`report-to`.
  - The audit above found nothing that the directive would block.
- **If D1 is overturned later** (the nonce path):
  - `proxy.ts` per the guide: `crypto.randomUUID()` → base64 nonce; `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'`. **No `'strict-dynamic'`**: every script is same-origin, and Turbopack's chunk loader inserts `src` scripts that `'self'` already allows, so keeping `'self'` meaningful is stricter.
  - The proxy sets the request header so Next extracts the nonce (`next/dist/server/route-modules/app-page/parse-request-headers.js` reads `content-security-policy` or `-report-only`).
  - Matcher excludes `_next/static`, `_next/image`, files under `public` and prefetches.
  - `next.config` `headers()` keeps the non-CSP headers.
  - It would ship as its own plan item, with a browser smoke matrix.

**Changes.**
- apps/web `lib/security-headers.ts:28-34`: add `["script-src-attr", ["'none'"]]` directly after `script-src`, with a one-line comment ("Inline event handlers stay blocked even though Next's inline RSC scripts need 'unsafe-inline'."). Line 1 stays.

**Compatibility.**
- No API or native effect.
- Static pages and caching are unchanged.
- Manual smoke test before merge, in Chrome, Firefox and Safari, with no CSP violations in the console:
  - `/login` (password and passkey);
  - `/calendar` (theme toggle, command palette, event editor);
  - `/mail` (reader with HTML mail, compose with an HTML signature, PDF attachment preview);
  - `/privacy`, `/support`, `/licenses`.
- `bun run dev` loads without violations. If dev tooling ever needs inline handlers, apply the directive in production only.

**Tests.**
- `apps/web/__tests__/lib/security-headers.test.ts`: in "is strict about framing, plugins, base and scripts in production" (:42-54) add `expect(csp.get("script-src-attr")).toEqual(["'none'"])`, and assert the same in the development case (:56-66).

**Docs.**
- AGENTS.md §2 "Secure coding": add the bullet "Web CSP keeps `script-src 'unsafe-inline'` because Cache Components shells cannot carry nonces, and blocks inline event handlers with `script-src-attr 'none'`; never add an inline `on*` attribute."

**Decisions.**
- D1 Adopt nonce CSP by turning off Cache Components and Partial Prefetching? Default: no. Ship `script-src-attr 'none'` and revisit when Next supports nonces or hashes with Cache Components.
- D2 Report-only first? Default: no (no redacted reporting endpoint; enforce after the manual smoke test).

---

## Encryption design (S7–S9)

### S7. Bind event ciphertext to its event row
**Effort** L · **Risk** high · **Touches** packages/calendar-core, packages/e2ee, packages/calendar-client, crates/solace-api-types, apps/backend, packages/api-contracts, apps/web, packages/native-core, apps/native-calendar (native-mail only through shared code)

**Why.** Every event's `encryptedContent` is sealed under the constant AAD `event-content:v1`. The server can therefore move or replay one event's ciphertext onto any other event of the same account without detection, for example to show "Therapy" at a different event's time. Binding the AAD to the stored row id stops that. A dated cutoff stops the server from downgrading to the unbound format.

**Current state.**
- `packages/calendar-core/src/content-encryption.ts:37-41` `eventContentAad(keyVersion)` returns `event-content:v${keyVersion}`. `CONTENT_ENCRYPTION_KEY_VERSION = 1` (`:14`) is shared with names (`encryptedNameAad`, `:30-35`).
- Encrypt: `packages/e2ee/src/payloads.ts:91-144` `encryptEventContentRequest` uses `eventContentAad(keyVersion)` at `:113` and has no id parameter. The provider interface `packages/e2ee/src/provider.ts:23-27` `attachEventEncryptionShadow(request)` has no id either.
- Decrypt is duplicated, and each copy hard-codes the AAD and ignores the row's version: `apps/web/lib/web-e2ee-provider.ts:83-109` (`"event-content:v1"` at `:102`) and `packages/native-core/src/lib/native-e2ee-provider.ts:440-471` (`:464`).
- A server-visible version already exists. `calendar_event.encryption_key_version` (`apps/backend/src/db/entities/calendar_event.rs:52`) is set from the request's `encryptionKeyVersion` (`events/service.rs:404-406`, `:585-587`). The validator accepts any int ≥ 1 (`http/schemas.rs:67-77`), so the deployed API already stores `2`.
- Ids come from the server. `db/behavior.rs:45-48` sets a cuid only when `id` is unset, and no create DTO has an `id` (`crates/solace-api-types/src/events.rs:356` `CreateEventRequest`).
- Generated occurrences carry id `<seriesId>_<ISO instant>` (`events/listing.rs:177`) and the series ciphertext. The client maps them back with `storedEventId` (`packages/calendar-core/src/recurring-event-target.ts:26`).
- The server copies ciphertext onto new ids in four places:
  - Recurring `this_only` / `this_and_future` child rows: `recurring/service.rs:256-279` `apply_content` copies the series ciphertext, `:282-321` `child_row`, `:363-411` `edit`.
  - Bulk `duplicate`: `events/service.rs:858-940` copies `encrypted_content` to a new cuid. No client calls `bulkEventOperation` (`calendar-api-service.ts:1371`; no callers).
  - The invitation import `seal_for` fallback seals moved occurrences with their series' entry (`invitations/service.rs:119-128`, applied in `upsert` `:538-626`).
  - ICS import inserts rows with server ids (`subscriptions/service.rs:734-825`). Existing external ids are skipped, never updated (`:757-760`).
- Partial updates re-encrypt with stored content: `calendar-api-service.ts:87-106` `needsStoredContent` / `withStoredContent`. If the stored event did not open, `getEvent` returns the `"Encrypted event"` placeholder (`packages/e2ee/src/hydration.ts:33-51`, `calendar-api-service.ts:221-231`). The placeholder is then sealed over the real title, which is an existing data-loss hazard.
- Re-seal: `resealEventAttributes` (`calendar-api-service.ts:541-569`) → `POST /api/events/{id}/seal-encryption` with `expectedEncryptedContent` → `events/service.rs:979-1004` `reseal` (compare-and-replace). The upgrade report is built in `e2ee/upgrades.rs:22-39` and swept by `packages/calendar-client/src/encryption-upgrade.ts:55-75`.
- Precedent for id-bound AADs: `packages/e2ee/src/notification-title.ts:17-23` (`notification-title:v1:<eventId>`).
- Precedent for a dated client cutoff: `packages/calendar-client/src/auth-key-fetch.ts:20` `RAW_PASSWORD_UPGRADE_ENDS = Date.UTC(2026, 11, 1)`.

**Design.**
1. **What to bind: the stored row id only.**
   - The AAD uses `storedEventId(event.id)`, so generated occurrences open with their series row's id.
   - Not the calendar id. Moves are content-free writes that must keep working without re-encryption (`PUT /api/events/{id}` with only `calendarId`, and bulk `move`).
   - Not the owner id. The account key is per user, so cross-account swaps already fail.
2. **Format.**
   - Bound: `event-content:v2:<storedEventId>`.
   - Legacy: `event-content:v1`, unchanged.
   - The format travels in the existing `encryptionKeyVersion` column/field: `1` = legacy, `2` = bound. No migration is needed.
   - New constants in `content-encryption.ts`: `BOUND_EVENT_CONTENT_VERSION = 2` and `eventContentAad(keyVersion: number, eventId: string)`, which returns `event-content:v1` for version 1, else `event-content:v${keyVersion}:${eventId}`.
   - Names keep `CONTENT_ENCRYPTION_KEY_VERSION = 1`.
   - The version is a hint for choosing the AAD and for upgrade listing. It is never trusted; the cutoff is the defense.
3. **Ids at create: the client proposes them.**
   - New `newClientEntityId()` in `content-encryption.ts` returns 32 lowercase hex chars from `crypto.getRandomValues(new Uint8Array(16))`, the same construction as `createMailMessageId` in `packages/calendar-core/src/mail-pgp-mime.ts:102-107`. Global `crypto` works on Hermes after `install-native-crypto.ts`.
   - The server accepts the id only if it matches `^[0-9a-f]{32}$`. That pattern cannot collide with 25-char cuids or with `_<ISO>` instance ids.
   - A taken id hits the PK unique violation, which already maps to 409 (`apps/backend/src/error.rs:119-129`).
   - Create-then-seal was rejected: it costs two round trips, and it leaves a window of legacy ciphertext that the client itself refuses after the cutoff.
   - Additive optional fields:
     - `CreateEventRequest.id`.
     - `EditRecurringRequest.newEventId` (top level).
     - `EncryptedIcsEvent.id`.
     - `InvitationEncryptionEntry.eventId`.
4. **Dated write switch: `BOUND_EVENT_CONTENT_STARTS = Date.UTC(2027, 0, 11)`.**
   - Before this date, new clients keep writing v1 and read both formats. Shipped binaries and stale web tabs decrypt only `event-content:v1`. If v2 were written immediately, they would show placeholders and seal them over real titles.
   - `eventContentWriteVersion(now = Date.now())` returns `2` once `now >= BOUND_EVENT_CONTENT_STARTS`, else `1`. The new id fields are sent only in bound mode.
5. **Downgrade cutoff: `LEGACY_EVENT_CONTENT_ENDS = Date.UTC(2027, 6, 1)`.** After this date, clients refuse to open version-1 event content. It is shown as the placeholder with `contentUnavailable: true` (see 8).
6. **Server guards** (all small):
   - **(a) No downgrade on overwrite.** In `events::service::update` and in the `all` scope of `recurring::service::edit` (`series_update`): if the request carries `encrypted_content` and `encryption_key_version.unwrap_or(1) < existing.encryption_key_version`, answer `AppError::Conflict("Update the app to edit this event.")`.
   - **(b) Version only with ciphertext.** `update` sets `encryption_key_version` only together with `encrypted_content` (today `events/service.rs:585-587` sets it alone).
   - **(c) Child rows.** In `child_row`/`edit`: use `new_event_id` as the child row id when present. If the series has `encryption_key_version >= 2` and the edit carries no new ciphertext, answer 409 `"Update the app to edit one occurrence of this event."`.
   - **(d) Bulk duplicate.** `bulk` `duplicate` refuses rows with `encryption_key_version >= 2` (`AppError::validation("Duplicate this event in the app.")`).
   - **(e) Invitation import.**
     - In `upsert`, a new row takes `entry.event_id` as its id.
     - An existing unsealed copy is sealed only when `entry.event_id == existing.id`; an entry without `event_id` keeps today's behaviour.
     - `seal_for`'s `::RECURRENCE::` series fallback applies only to entries without `event_id`. Bound overrides stay readable copies until `sealReadableInvitations`, the accepted invitation-copy exception.
   - **(f) ICS import.** `import_ics` uses `entry.id` as the row id when present.
7. **Upgrade.**
   - `EncryptionUpgrades.eventsWithUnboundContent: Vec<EventId>` lists rows with `user_id = ?`, `subscription_id IS NULL`, `encryption_state = 'encrypted'`, `encrypted_content <> ''` and `encryption_key_version < 2`, ordered by id, limit `BATCH` (200).
   - `upgradeStoredEncryption` reseals them with the existing `resealEventAttributes`. Through the new `attachEventEncryptionShadow(request, id)` it now writes v2 under the same `expectedEncryptedContent` compare-and-replace. This happens only when `Date.now() >= BOUND_EVENT_CONTENT_STARTS`, merged and deduplicated with `eventsWithReadableAttributes`.
8. **Undecryptable guard.**
   - `hydrateEncryptedEventWithoutSession` and `normalizeUndecryptableEncryptedEvent` set the client-only `CalendarEvent.contentUnavailable = true`.
   - `withStoredContent` throws `EVENT_CONTENT_UNAVAILABLE_MESSAGE` ("This event can't be opened on this device, so it can't be edited.") when `stored.contentUnavailable`.
   - The web and native editors treat such events as read-only, at the same gate they already use for `isSynced`.
9. **Names and preferences.**
   - Calendar and category names: **defer** (see Decisions). Binding them needs the same machinery again: client ids on `POST /api/calendars`, `/api/calendars/defaults`, `/api/categories` and subscription create, a second upgrade list, and a second cutoff. The value is lower, because the server can only swap labels.
   - Sealed preferences: **never**. There is one blob per account under the purpose-unique AAD `user-settings:v1`, so there is nothing to swap with. Rollback is the only remaining risk, and binding does not address it.
10. **What this does NOT protect.**
    - Rollback of an event to an older ciphertext of the *same* row (the server keeps history and backups).
    - Withholding or deleting events.
    - Tampering with plaintext metadata: times, recurrence, calendar membership, participants, reminders.
    - Generated occurrences legitimately share their series content.
    - Before `LEGACY_EVENT_CONTENT_ENDS`, a server can still replay any legacy ciphertext labelled version 1.
    - **A revision counter is not worth adding.** Rollback detection needs trusted per-event state on every device. The query cache is never persisted (§4), so a new or cleared device cannot detect rollback, and the server can withhold updates anyway.

**Changes.**
- **packages/calendar-core**
  - `content-encryption.ts`:
    - Add `BOUND_EVENT_CONTENT_VERSION`, `BOUND_EVENT_CONTENT_STARTS`, `LEGACY_EVENT_CONTENT_ENDS`, `eventContentWriteVersion(now?)`, `newClientEntityId()`, `CLIENT_ENTITY_ID_PATTERN = /^[0-9a-f]{32}$/` and `EVENT_CONTENT_UNAVAILABLE_MESSAGE`.
    - Change `eventContentAad(keyVersion, eventId)` as in Design 2.
  - `types.ts:100` `CalendarEvent`: add `contentUnavailable?: boolean` (client-only).
  - `route-schemas.ts:92` `encryptedIcsImportEventSchema`: add `id: z.string().regex(CLIENT_ENTITY_ID_PATTERN).optional()`.
- **packages/e2ee**
  - `payloads.ts`:
    - `encryptEventContentRequest(e2ee, keys, request, eventId: string, keyVersion = eventContentWriteVersion())`.
    - New `decryptEventContent(e2ee: ContentDecrypter, keys, event, now = Date.now()): Promise<DecryptedEventContent | null>`. It reads `event.encryptionKeyVersion ?? 1`, returns null for version 1 when `now >= LEGACY_EVENT_CONTENT_ENDS`, otherwise parses with `parseEncryptedJsonPayload` and decrypts with `eventContentAad(version, storedEventId(event.id))`. Any failure returns null.
  - `provider.ts`: change the interface to `attachEventEncryptionShadow(request, eventId: string)`. `NoopE2eeProvider` ignores the id.
  - `hydration.ts`: `hydrateEncryptedEventWithoutSession` adds `contentUnavailable: true`.
- **crates/solace-api-types + apps/backend**
  - `events.rs`:
    - `CreateEventRequest.id: Option<EventId>`.
    - `InvitationEncryptionEntry.event_id: Option<EventId>`.
  - `recurring.rs:107-116`: `EditRecurringRequest.new_event_id: Option<EventId>`.
  - `subscriptions.rs:173`: `EncryptedIcsEvent.id: Option<EventId>`.
  - `e2ee.rs:11`: `EncryptionUpgrades.events_with_unbound_content: Vec<EventId>`, with `#[schema(required = true)]`.
  - `http/schemas.rs`: add `client_entity_id_schema()` (`zod::string().regex(&CLIENT_ID)`, with `static CLIENT_ID: LazyLock<Regex>` for `^[0-9a-f]{32}$`). Use it in:
    - `events/routes.rs:55-72` (`"id"`).
    - `recurring/routes.rs:36` (`"newEventId"`).
    - `encrypted_ics_import_event_schema` (`:205`, `"id"`).
    - `invitations/routes.rs:22-27` (`"eventId"`).
  - `events/service.rs`:
    - `create` (`:385-402`) sets `id: Set(id)` when present.
    - `update` applies guards (a) and (b).
    - `duplicate` applies (d).
    - `seal` is unchanged.
  - `recurring/service.rs`: `edit`, `child_row` and `series_update` apply (a) and (c).
  - `invitations/service.rs`: `seal_for`, `upsert` and `local_data` apply (e).
  - `subscriptions/service.rs:776`: apply (f).
  - `e2ee/upgrades.rs`: add `events_with_unbound_content()` beside `events_with_readable_attributes` (`:66-88`) and add it to the `try_join!` at `:23`.
  - No migration.
  - Run `cargo xtask openapi` and commit `packages/api-contracts`.
- **packages/calendar-client**
  - `calendar-api-service.ts`:
    - `createEvent` (`:651`): in bound mode, `id = newClientEntityId()`; attach with `id`; send `{ ...payload, id }`.
    - `updateEvent` (`:668`): bind to `storedEventId(id)`.
    - `editRecurringEvent` (`:1138`):
      - `editScope === "all"` binds to `storedEventId(id)`.
      - Otherwise, in bound mode: `newEventId = newClientEntityId()`. Fill all content with `withStoredContent(updates, await this.getEvent(id))` whenever the edit is not a full-content edit, even with zero content fields. Bind to `newEventId` and send it.
    - `sealEventEncryption` (`:472`) and `resealEventAttributes` (`:541`): bind to `event.id` / `id`.
    - `buildInvitationImportEncryption` (`:430`): `existing = await this.getInvitationByExternalId(parsed.uid, { syncRemote: false })`; bind to `existing?.id ?? newClientEntityId()`; send `eventId` (bound mode only).
    - `importICS` (`:1195-1206`): per-entry `id = newClientEntityId()`, bound and sent.
    - `withStoredContent` (`:94`): add the guard from Design 8.
    - `normalizeUndecryptableEncryptedEvent` (`:221`): set `contentUnavailable`.
  - `encryption-upgrade.ts`: reseal `eventsWithUnboundContent` (Design 7).
  - `recurring-event-persistence.ts` needs no change (it already passes `target.parentEventId`).
- **apps/web**
  - `lib/e2ee-payloads.ts:63` `attachEventEncryptionShadow(request, eventId)`.
  - `lib/web-e2ee-provider.ts:39-43, 83-109`: pass the id through; replace the inline decrypt with `decryptEventContent`.
  - `components/event-editor/event-editor-footer.tsx:171, 270`: read-only when `selectedEvent.contentUnavailable`.
- **packages/native-core** (`lib/native-e2ee-provider.ts:384-390, 440-471`): same as web.
- **apps/native-calendar** (`src/components/event/EventDetailsView.tsx:98`): read-only for `contentUnavailable`.

**Compatibility.**
- Every new field is optional and additive, and responses only gain `eventsWithUnboundContent`.
- Nothing changes on the wire before `BOUND_EVENT_CONTENT_STARTS` (about 8 weeks of OTA and web reload uptake).
- After the start date, shipped binaries that missed the OTA:
  - They show bound events as "Encrypted event".
  - Their content writes onto bound rows get 409 from guard (a), so they never seal the placeholder over real content.
  - Their single-occurrence edits on bound series get 409 from guard (c).
  - Their new events are v1, and the next new client reseals them.
- Deploy overlap: no schema change. The old API rejects the new fields (`deny_unknown_fields` / strict Zod) instead of silently ignoring a proposed id, and new clients send them only after the start date, by which time the new API has long been live.
- Existing data: all current rows are version 1 and keep opening until `LEGACY_EVENT_CONTENT_ENDS`.
- Accounts that stay dormant past the cutoff will see their unswept events as read-only placeholders.

**Tests.**
- `packages/e2ee/src/__tests__/payloads.test.ts`:
  - A bound round trip opens.
  - The same ciphertext presented under another id returns null.
  - An occurrence id `<id>_2027-…Z` opens its series' content.
  - v1 opens before `LEGACY_EVENT_CONTENT_ENDS` and returns null after it (inject `now`).
  - The write version flips at `BOUND_EVENT_CONTENT_STARTS`.
- Update `packages/e2ee/src/__tests__/encrypt-hydrate-roundtrip.property.test.ts` for the new signatures.
- New `packages/calendar-client/src/__tests__/event-content-binding.test.ts`:
  - `createEvent` sends an `id` that matches the pattern, and the payload is bound to it.
  - A time-only `this_only` edit sends `newEventId` with bound ciphertext.
  - `updateEvent` on an instance id binds to the series id.
  - `withStoredContent` refuses a `contentUnavailable` stored event.
- Extend:
  - `packages/calendar-client/src/__tests__/ics-import.test.ts`: each entry has an id bound to its ciphertext.
  - `packages/calendar-client/src/__tests__/encryption-upgrade.test.ts`: unbound ids are resealed only after the start date.
  - `packages/calendar-client/src/__tests__/respond-to-invitation.test.ts` and `mail-invitation-response.test.ts`: `eventId` on the import entry.
  - `apps/web/__tests__/lib/e2ee-payloads.test.ts`, `apps/web/__tests__/lib/calendar-api-service.test.ts` and `packages/native-core/src/providers/E2eeProvider.test.tsx`: new provider signature.
- API suite (`crates/solace-api-tests/tests/api/`):
  - `events.rs`:
    - Create with a 32-hex `id` keeps it.
    - A malformed id answers 400 (strict schema).
    - A taken id answers 409.
    - A v1 content update over a v2 row answers 409.
    - `encryptionKeyVersion` without content leaves the version unchanged.
    - Bulk `duplicate` of a v2 row is refused.
  - `recurring.rs`:
    - `this_only` with `newEventId` creates the child with that id.
    - A v2 series `this_only` edit without ciphertext answers 409.
  - `events_import.rs`: an entry `id` is honored.
  - `invitations.rs`:
    - A new copy takes `eventId`.
    - A mismatched `eventId` leaves an existing copy unsealed.
  - `encryption_upgrades.rs`: a v1 encrypted row is listed in `eventsWithUnboundContent` and leaves the list after a v2 `seal-encryption` with `expectedEncryptedContent`.

**Docs.**
- AGENTS.md §2, in the "Every account is end-to-end encrypted…" paragraph, after "Build payloads with `encryptEventContentRequest`/`encryptNameRequest` (`@workspace/e2ee`).", add:

  > "Event content is bound to its stored row id (`eventContentAad`: `event-content:v2:<id>`, `encryptionKeyVersion` 2): clients propose the ids of rows they create (`newClientEntityId`), write bound content from `BOUND_EVENT_CONTENT_STARTS`, open unbound content only until `LEGACY_EVENT_CONTENT_ENDS`, and the API never copies bound ciphertext onto another row."
- In the upgrades sentence, change "(colour or category in readable columns, …, readable feed names)" to "(colour or category in readable columns, event content not yet bound to its id, …, readable feed names)".

**Decisions.**
- Dates: `BOUND_EVENT_CONTENT_STARTS` = 2027-01-11 and `LEGACY_EVENT_CONTENT_ENDS` = 2027-07-01. Before the second date, the operator counts the remaining rows (`encryption_state='encrypted' AND subscription_id IS NULL AND encryption_key_version < 2 AND encrypted_content <> ''`) and moves the date in a follow-up if needed. **Default: these dates.**
- Bind calendar and category names in this PR? **Default: no; open a follow-up issue.**
- Bind sealed preferences? **Default: never.**
- Add a revision counter? **Default: no.**
- Recurring invitation overrides stay readable copies until the sweep. **Default: accept.**
- Bulk `duplicate`: refuse it for bound rows, or remove the action? **Default: refuse** (removing it could break a shipped binary).

### S8. Recovery kit (password reset that keeps encrypted data, and the lost-passkey path)
**Effort** L · **Risk** high · **Touches** packages/e2ee, packages/calendar-core, packages/calendar-client, crates/solace-api-types, apps/backend (+ migration), packages/api-contracts, apps/web, packages/native-core

**Why.**
- Today a forgotten password means emailing support, and support cannot restore encrypted data.
- A lost passkey can be bypassed with a password session alone, which is the Known gap in AGENTS.md §2.
- A recovery kit made of a high-entropy secret and a recovery envelope fixes both. The reset becomes self-service and keeps the data, and passkey registration and deletion can then demand step-up.

**Current state.**
- `packages/calendar-core/src/product-info.ts:18-19` `FORGOT_PASSWORD_NOTICE`. It is used by:
  - `apps/web/app/login/_content.tsx:1186-1198` ("Forgot password?" sets a notice).
  - `packages/native-core/src/screens/SignInScreen.tsx:208-216` (`Alert.alert`).
  - `packages/calendar-client/src/auth-key-fetch.ts:115`.
- Password change with envelope: `apps/backend/src/auth/passwords.rs:95-166`. It requires step-up when an envelope is sent (`:105-111`, `codes::passkey_step_up_required()`), checks the current password (`:133-144`), stores password and envelope in one transaction via `store::change_password` (`auth/store.rs:50-63`), revokes other sessions, and mails via `notify_password_updated` (`:83-93`, `email::send(..., Mode::BestEffort)`).
- Envelope storage: `user_encryption_password` (`db/entities/user_encryption_password.rs`, unique `user_id`), written by `e2ee::service::store_password_keys`.
- Auth key: `auth/password.rs` (`ak1:` + scrypt over the client-derived `solace-ak1:` key; `Presented::of`, `verify`, `hash`). Clients swap passwords in `createAuthKeyFetch` (`packages/calendar-client/src/auth-key-fetch.ts:13-17` `PASSWORD_ROUTES`).
- Envelope crypto: `packages/e2ee/src/e2ee-module.ts:364-449`:
  - `createPasswordEnvelope` / `unwrapPasswordEnvelope` wrap the raw account and blind-index keys with AES-GCM under AAD `account-key:<v>` / `blind-index-key:<v>`.
  - `assertEnvelopeKdfParameters` (`:114-131`) stops a server from steering the KDF.
- HKDF already exists as HMAC-SHA-256 extract+expand in `packages/e2ee/src/notification-title.ts:37-64` (`deriveNotificationKeyBytes`, mirrored in the Swift NSE). The provider has no `deriveBits` (`e2ee-module.ts:560`).
- Passkeys (`auth/passkeys.rs`):
  - `registration_options` (`:268`) and `verify_registration` (`:353`) need only `require_fresh_session` (`auth/sessions.rs:74-88`, no step-up), and registration hands out a step-up cookie (`:393, :397`).
  - `delete` (`:671`) needs only `require_session`.
  - The step-up check is `guard::step_up` (`auth/guard.rs:86-96`); it passes when the account has no passkeys.
- The native passkey bridge hands the app session to the browser through a one-time token (`auth/one_time_token.rs:44-93`). The browser then calls `freshen_session` (`passkeys.rs:712-730`) and `addPasskey` (`apps/web/lib/native-passkey-bridge-action.ts:92-112`). Neither step carries the app's step-up.
- `bridge_step_up` and `complete_step_up` (`passkeys.rs:732-756`) already move a step-up grant across the bridge in the other direction.
- Auth rate limits: `auth/rate_limit.rs:29-49` `RULES: [(&str, Option<Rule>); 19]`, a DB limiter keyed by an HMAC of `ip|path`, applied to every `/api/auth/*` path by `auth/pipeline.rs:32-80`.
- Constant-time compare precedent: `mail_admin.rs:47` (`Sha256::digest(..).ct_eq(..)`); `subtle` and `sha2` are already dependencies.
- Account deletion cascades from `user` (`account/queries.rs:23-69`).

**Design.**
1. **Secret.**
   - 16 random bytes (128-bit).
   - Kit string: Crockford base32 of `secret ‖ SHA-256(secret)[0..4]`, which is 20 bytes or 32 chars, shown as 8 groups of 4 (`XXXX-XXXX-…`).
   - Parsing is case-insensitive, ignores spaces and hyphens, and maps `I/L→1` and `O→0`. The checksum rejects typos before any request.
   - No dependency (about 25 lines). Words via `@scure/bip39` (MIT, 0 deps) were considered and not chosen: no new dependency, language-neutral, easier to type from print.
2. **Derivation.**
   - Extract `hkdfSha256(crypto, ikm: Uint8Array, info: string): Promise<Uint8Array>` from `notification-title.ts:37-64` into new `packages/e2ee/src/hkdf.ts` (salt = 32 zero bytes, one 32-byte block). `deriveNotificationKeyBytes` keeps byte-identical output.
   - `info "solace/recovery-wrap/v1"` → AES-GCM-256 wrapping key (`importKey`, non-extractable).
   - `info "solace/recovery-auth/v1"` → `recoveryAuthKey = "rk1:" + base64url(32 bytes)` (47 chars).
   - No slow KDF is needed for a 128-bit secret.
   - The info strings are fixed on the client, so the server cannot steer the wrap key onto the auth key it receives.
3. **Recovery envelope.** New `E2eeModule` methods next to the password envelope reuse `encryptBytes`/`decryptBytes`:
   - `deriveRecoveryAuthKey(secret)`.
   - `createRecoveryEnvelope(accountKey, blindIndexKey, secret, keyVersion = 1)`, which returns `{ wrappedAccountKey, wrappedSearchKey, keyVersion }` with AAD `recovery-account-key:<v>` / `recovery-blind-index-key:<v>`.
   - `unwrapRecoveryEnvelope(secret, envelope)`.
   - A server cannot forge an envelope that opens, because it never learns the wrap key.
   - Plus pure helpers in new `packages/e2ee/src/recovery-kit.ts`: `generateRecoverySecret`, `formatRecoveryKey`, `parseRecoveryKey` (returns `Uint8Array | null`).
4. **Storage.**
   - New table `user_recovery_kit`: `user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`, `auth_key_hash TEXT NOT NULL` (hex SHA-256 of the `rk1:` string), `wrapped_account_key TEXT NOT NULL`, `wrapped_search_key TEXT NOT NULL`, `key_version INTEGER NOT NULL`, `created_at TIMESTAMP(3) NOT NULL`. This follows `user_mail_trust` in `m20261110_160000_encrypted_mail_trust.rs`.
   - It holds credential material, not PII or ephemeral data, so it has no TTL. It lives as long as the account and is covered by account deletion through the FK cascade, as `user_encryption_password` is.
5. **Session routes** (OpenAPI, `RouteUser`, so passkey step-up comes from the guard):
   - `GET /api/e2ee/recovery-kit` → `RecoveryKitStatus { exists, createdAt? }` (`getRecoveryKit`).
   - `PUT /api/e2ee/recovery-kit` with `RecoveryKitRequest { currentPassword, recoveryAuthKey, wrappedAccountKey, wrappedSearchKey, keyVersion? }` → `RecoveryKitStatus` (`putRecoveryKit`).
     - `currentPassword` is the auth key the client derived with `deriveAuthKey`. It is verified like `passwords.rs:133-144`; `UpgradeRequired` answers `codes::password_upgrade_required()`.
     - The kit is upserted, which replaces and invalidates the old one.
     - Mails `email::recovery_kit_changed(name, true)`.
     - Rate limit: `rate_limit::enforce("recovery-kit", &user.id, Limit::per_minute(5))`, following `e2ee/routes.rs:22`.
   - `DELETE /api/e2ee/recovery-kit` → `SuccessMessage` (`deleteRecoveryKit`). Mails `recovery_kit_changed(name, false)`.
6. **Recover routes** (unauthenticated, under `/api/auth`, so the DB rate limiter and origin checks apply):
   - `POST /api/auth/recovery/start` with `RecoveryStartRequest { email, recoveryAuthKey }` → `RecoveryEnvelope { wrappedAccountKey, wrappedSearchKey, keyVersion }` (`startAccountRecovery`).
   - `POST /api/auth/recovery/complete` with `RecoveryCompleteRequest { email, recoveryAuthKey, newPassword, passwordEnvelope: PasswordEnvelopeRequest, removePasskeys?: bool }` → `StatusFlag` (`completeAccountRecovery`).
   - Both follow the `passwords::change_password` handler shape (`AuthBody` + `validate`) and are also annotated with `#[utoipa::path]` and registered through `routes!` like `get_session` (`auth.rs:33-35`), so the DTOs reach api-contracts.
   - Add `("/recovery/start", rule(900, 10))` and `("/recovery/complete", rule(900, 5))` to `RULES` (array length 21).
   - **Enumeration resistance.** An unknown email, a missing kit and a wrong key all return the identical 401 `ApiError::new(UNAUTHORIZED, "INVALID_RECOVERY_KIT", "Email or recovery key is incorrect.")`. The SHA-256 is always computed, and comparison uses `ct_eq`.
   - **complete, in one transaction:**
     1. Lock the kit row (`SELECT … FOR UPDATE`) and re-verify the key.
     2. Require `Presented::AuthKey` for `newPassword` plus `check_auth_key_email`, and refuse raw passwords.
     3. Hash with `password::hash` before the transaction.
     4. Apply `store::set_password`, `e2ee::service::store_password_keys` (via `password_keys(envelope)`) and `store::delete_user_sessions` (`auth/store.rs:211`).
     5. Delete the kit (single use).
     6. If `removePasskeys == Some(true)`, delete the user's passkeys.
     7. After commit, `email::send(..., email::account_recovered(name, sign_in_url))`.
   - The route does not sign in. The client then signs in normally with the new password, which reuses every unlock path: web `unlockWithSignInPassword` (`apps/web/lib/e2ee-bootstrap.ts:409`) and native sign-in plus session preparation. The account key is unchanged, so data, devices and the notification-extension keys stay valid.
7. **Clients** (shared in new `packages/calendar-client/src/account-recovery.ts`):
   - `createRecoveryKit({ api, e2ee, keys, email, currentPassword })` returns the formatted kit string.
   - `recoverAccount({ post, e2ee, email, recoveryKey, newPassword, removePasskeys })`: parse (typo error before network), derive, `start`, unwrap, `createPasswordEnvelope(newPassword)`, then `complete`.
   - `post` is the Better Auth client's `$fetch`, as native already does for `/passkey-bridge/complete-step-up` (`packages/native-core/src/lib/passkey-browser-bridge.ts:380`).
   - Add `"/recovery/complete": { next: "newPassword" }` to `PASSWORD_ROUTES` so the shared fetch enforces length rules and swaps the password for its auth key in one place.
   - Session-route methods go on `AccountApiService` (`packages/calendar-client/src/account-api-service.ts`): `getRecoveryKit`, `putRecoveryKit`, `deleteRecoveryKit`.
8. **UI.**
   - **Web.**
     - The login "Forgot password?" opens new `apps/web/app/login/recover-account-dialog.tsx`: `@workspace/ui` Dialog with email, recovery key, new password, confirm, and a "Remove passkeys (I lost them)" switch that defaults on. On success it runs the existing sign-in submit path. A "No recovery kit?" line shows `FORGOT_PASSWORD_NOTICE`.
     - The command palette security view (`apps/web/components/command-palette/security-settings.tsx`) gets a "Recovery kit" row. It asks for the password, shows the key once with Copy, "Download .txt" (Blob, saved only by the user) and Print (a print-only section plus `window.print()`), and requires an "I saved it" confirmation.
   - **Native** (drawers):
     - `SignInScreen` "Forgot password?" opens new `packages/native-core/src/components/auth/RecoverAccountSheet.tsx` (`BottomSheet`, `SheetSections`), then `signIn` with the new password.
     - `SecuritySettingsContent` gets a row opening a `SheetSubPage` `RecoveryKitPage`: Copy via `expo-clipboard` (already a native-core dependency) and Share via React Native core `Share.share({ message })`. The app writes nothing to disk; the key lives only in component state and is cleared on close.
     - Add "Recovery kit" to `packages/native-core/src/lib/settings-search-entries.ts` and to the web palette `navigation-config.ts`.
   - Step-up prompts get a "Lost your passkey? Use your recovery kit" link that opens the recover flow:
     - Web: login with `stepUp=1` (`_content.tsx:603-623`).
     - Native: `SignInScreen` step-up state.
9. **Step-up tightening** (closes the Known gap).
   - `registration_options`, `verify_registration` and `delete` call `guard::step_up(&state, &headers, &active)` after the session check, mapping `StepUpRequired` to `codes::passkey_step_up_required()` exactly as `passwords.rs:105-111` does.
   - The first passkey still registers, because `step_up` passes without passkeys.
   - To keep native "add passkey" working through the bridge:
     - (a) `one_time_token::generate` also writes `store::create_verification(&bridge_step_up(&active.session.id), …)` when `guard::step_up_verified(&state, &headers, &active)`.
     - (b) `native-passkey-bridge-action.ts` calls `/passkey-bridge/complete-step-up` after `/one-time-token/verify` and ignores a 403.
     - (c) `freshen_session` adds `step_up(&state, &fresh)` to its cookies when the old session was step-up-verified.

**Changes.**
- **packages/e2ee**
  - New `hkdf.ts` and `recovery-kit.ts`.
  - `e2ee-module.ts`: three new `E2eeModule` methods.
  - `notification-title.ts`: uses `hkdfSha256`.
  - `index.ts`: exports.
- **packages/calendar-core** (`product-info.ts`):
  - New `RECOVERY_KIT_NOTICE` ("Keep this key somewhere safe. Anyone with it and your email can reset your password.").
  - `FORGOT_PASSWORD_NOTICE` becomes "No recovery kit? Email … from a different email address and include your Solace address." Update its one-line comment.
- **crates/solace-api-types**:
  - `e2ee.rs`: `RecoveryKitStatus`, `RecoveryKitRequest`.
  - `auth.rs`: `RecoveryStartRequest`, `RecoveryEnvelope`, `RecoveryCompleteRequest`.
- **apps/backend**:
  - Migration `cargo xtask migrate new user_recovery_kit`, then `cargo xtask entities`. In `db/behavior.rs`, add `impl ActiveModelBehavior for entities::user_recovery_kit::ActiveModel {}` beside `user_mail_trust` (`:96`).
  - New `e2ee/recovery.rs` (service: `status`, `store`, `remove`, `start`, `complete`) and routes in `e2ee/routes.rs`.
  - `auth.rs`: register `/api/auth/recovery/{start,complete}`, with thin handlers in new `auth/recovery.rs`.
  - `auth/rate_limit.rs`: RULES.
  - `auth/passkeys.rs`: registration_options, verify_registration, delete, freshen_session.
  - `auth/one_time_token.rs`: generate.
  - `email.rs`: `recovery_kit_changed`, `account_recovered`.
  - `cargo xtask openapi`.
- **packages/calendar-client**:
  - New `account-recovery.ts`.
  - `account-api-service.ts`: three methods.
  - `auth-key-fetch.ts`: route entry.
  - `index.ts`: exports.
- **apps/web**:
  - `app/login/_content.tsx`: open the dialog and add the step-up link.
  - New `app/login/recover-account-dialog.tsx`.
  - `components/command-palette/security-settings.tsx` plus new `components/command-palette/recovery-kit-settings.tsx`.
  - `lib/native-passkey-bridge-action.ts`.
  - `lib/auth-client` usage only.
- **packages/native-core**:
  - `screens/SignInScreen.tsx`.
  - New `components/auth/RecoverAccountSheet.tsx`.
  - `components/settings/sections/SecuritySettingsContent.tsx` plus new `components/settings/sections/RecoveryKitPage.tsx`.
  - `lib/settings-search-entries.ts`.
  - Both native apps get the change through native-core.
- **apps/notifications**: none, because mail goes through the API's noreply mailer.

**Compatibility.**
- All routes and tables are new; shipped binaries keep showing `FORGOT_PASSWORD_NOTICE`.
- Tightening affects only password-only sessions on accounts with passkeys. Those sessions already get 403 from every `RouteUser` route, so the only behaviour removed is the gap itself.
- Native "add passkey" keeps working once the bridge changes ship, because the bridge page is always the current web app.
- Deploy overlap:
  - The old API ignores the new table and does not serve the recovery routes; clients surface the 404 as "Try again shortly".
  - An old instance still allows the old passkey path for minutes.
- Existing data: none touched. Users without a kit are nudged by the settings row status.

**Tests.**
- `packages/e2ee/src/__tests__/recovery-kit.test.ts`:
  - Format and parse round trip.
  - `I/L/O` mapping.
  - A one-character typo returns null via the checksum.
  - Envelope round trip.
  - A wrong secret fails.
  - The auth key differs from the wrap key.
  - An HKDF known-answer vector.
- `packages/e2ee/src/__tests__/notification-title.test.ts` keeps its vectors after the extraction.
- `packages/calendar-client/src/__tests__/account-recovery.test.ts`:
  - The wire carries only `rk1:`, `solace-ak1:` and the envelope, never the key or the password.
  - A typo is refused before `post`.
- `packages/calendar-client/src/__tests__/auth-key-fetch.test.ts`: `/recovery/complete` swaps `newPassword` and enforces length.
- New API suite `crates/solace-api-tests/tests/api/recovery_kit.rs` (add `mod recovery_kit;` to `main.rs`):
  - PUT needs `currentPassword` and step-up when the account has passkeys.
  - GET reports status.
  - `start` returns an identical 401 body for an unknown email, no kit and a wrong key.
  - `start` returns the envelope.
  - `complete`:
    - The new auth key signs in and the old one fails.
    - The envelope is stored.
    - All sessions are revoked.
    - A second `start` gets 401 (single use).
    - `removePasskeys` deletes passkeys.
  - The 11th `start` from one IP within 15 minutes gets 429.
- `passkeys.rs`:
  - Registration options, registration and delete answer 403 `PASSKEY_STEP_UP_REQUIRED` for a password session on an account with a passkey, and pass with step-up.
  - The first passkey registers without step-up.
  - A one-time token from a stepped-up session lets `complete-step-up` succeed.
- `account_deletion.rs`: the kit row is gone.
- Backend unit tests in `auth/rate_limit.rs` for the new rules.
- Web: `apps/web/__tests__/app/login/recover-account-dialog.test.tsx`. Native: `packages/native-core/src/components/auth/RecoverAccountSheet.test.tsx`.

**Docs.**
- AGENTS.md §2: replace "Forgotten passwords go to support (`FORGOT_PASSWORD_NOTICE`); there is no reset route." with:

  > "A forgotten password is reset with the recovery kit: a 128-bit key shown once (`@workspace/e2ee` `recovery-kit.ts`) whose HKDF halves wrap the account keys (`user_recovery_kit`) and prove possession (`rk1:`, stored as SHA-256); `POST /api/auth/recovery/complete` stores the new auth key and envelope, revokes every session, consumes the kit and can remove passkeys, in one transaction. Accounts without a kit go to support (`FORGOT_PASSWORD_NOTICE`)."
- Change "Only a fresh sign-in password ever wraps the keys" to "Only a fresh sign-in password or the user's recovery key ever wraps the keys".
- Delete from the Known gaps: "; passkeys can be registered or deleted with a password session alone, which also earns step-up (it is today's lost-authenticator recovery)", ending the sentence after "push-fetch token."

**Decisions.**
- Add a reset route. **Default: yes** (`/api/auth/recovery/complete`).
- Secret format. **Default: base32 groups with a checksum, no dependency** (words via `@scure/bip39`, MIT, is the alternative).
- Kit is single-use and the app prompts for a new one after recovery. **Default: yes.**
- Tighten passkey step-up for every account now; accounts with no kit and no passkey left go to support. **Default: yes.**
- "Remove passkeys" switch defaults on. **Default: yes.**
- Creating a kit needs the current password plus step-up. **Default: yes.**
- Rotate the account key on recovery? **Default: no** (it would re-encrypt everything; follow-up if wanted).
- Delete E2EE device rows on recovery? **Default: no** (sessions are revoked; the device-key deletion rule handles the rest).

### S9. Seal calendar feed URLs
**Effort** M · **Risk** med · **Touches** crates/solace-api-types, apps/backend (+ migration), packages/api-contracts, packages/calendar-core, packages/calendar-client, apps/web, apps/native-calendar

**Why.** A private feed URL works as a password, and it sits in plaintext in `calendar_subscription.url` in the database and in backups. Sealing it on the device leaves the server with only a transient copy in a sync request body. This protects the URL at rest and against a passive operator, not against an active server, which still sees the URL on every sync.

**Current state.**
- `apps/backend/src/db/entities/calendar_subscription.rs:12-16`: `url TEXT NOT NULL`, unique `(user_id, url)` (`calendar_subscription_user_id_url_key`). The feed name is already sealed on the mirrored calendar (`subscriptions/service.rs:53-62`, `name_revision` `:168-183`).
- Server sync:
  - `subscriptions/scheduler.rs` runs inside the API (`main.rs:34-37`, gated by `CALENDAR_SYNC`, `config.rs:85-86, 167`) every 15 minutes over `queries::due` (`subscriptions/queries.rs:588-602`).
  - Create probes and starts an initial sync (`service.rs:229-302`).
  - The manual `POST /api/subscriptions/{id}/sync` (`routes.rs:109-117`, no body; `calendar-api-service.ts:1358-1366` sends `{}`) calls `sync_feed` → `mirror`, which fetches `&feed.url` (`service.rs:435-466`).
  - Every fetch goes through `SafeFetch`. Error texts never contain the URL (`service.rs:64-87`), and SafeFetch itself does no logging.
- **Feed events have no reminders.** `notifications/service.rs:21-33` returns no reminders for `is_synced` events, and `e2ee/upgrades.rs:104` and the reminder paths skip synced events. Server-side periodic sync therefore only keeps the mirrored events fresh for viewing; no push or email depends on it.
- Dedupe: `queries::by_url` (`queries.rs:100-110`) plus the unique constraint. Web `holiday-calendars-view.tsx:31, 78` compares `subscription.url` on the client.
- The UI reads `subscription.url`: web `subscription-management/subscription-source-info.tsx:117, 130`; native `apps/native-calendar/src/components/calendars/SubscriptionEditPage.tsx:114, 200`.
- Upgrade sweep: `sealSubscriptionNames` (`packages/calendar-client/src/encryption-upgrade.ts:32-52`) from `subscriptionsWithReadableNames` (`upgrades.rs:41-64`).

**Design.**
1. **Seal.**
   - Clients seal `{ url }` with `e2ee.encryptJson(value, SUBSCRIPTION_URL_AAD)`, where `SUBSCRIPTION_URL_AAD = "subscription-url:v1"`, into the new column `calendar_subscription.encrypted_url`.
   - Sealed rows store `url = 'sealed:' || id`. This keeps `NOT NULL` and the unique `(user_id, url)` constraint, fails fast with `UnsupportedScheme` in an old instance's scheduler, and contains no user data.
   - The AAD is not bound to the subscription id. A swap only lets the server mirror one of the user's feeds into another feed's calendar, and the server already controls plaintext feed content.
2. **Create** (`CreateSubscriptionRequest.encryptedUrl?`). The client still sends `url` because the server must probe it. When `encryptedUrl` is present, the server:
   - probes and checks holidays with the transient `url`;
   - stores only the ciphertext and the placeholder;
   - passes the transient `url` to the initial background `sync_feed`.
   Readable creates from shipped binaries are unchanged.
3. **Sync on demand.**
   - New `SyncSubscriptionRequest { url?: string }` on `POST /api/subscriptions/{id}/sync`, with schema `zod::object([("url", zod::string().url().optional())]).strict()`; the shipped `{}` still passes.
   - A sealed row requires `url`, otherwise `AppError::field("Update the app to sync this calendar.", "url")`. A readable row uses the stored `url`.
   - `sync_feed(state, feed, url: &str)` and `mirror(…, url)` replace `&feed.url`.
   - The server never stores or logs the body URL (handlers keep `#[tracing::instrument(skip_all)]`).
4. **Scheduler.** `queries::due` adds `encrypted_url IS NULL`, so only readable rows from shipped binaries still sync in the background.
5. **Client cadence.**
   - New `packages/calendar-core/src/subscription-feed.ts` contains:
     - `FEED_SYNC_QUERY_KEY = ["subscriptions", "feed-sync"] as const`, a cross-app key that belongs in calendar-core like `PUSH_DEVICES_QUERY_KEY`.
     - `isFeedSyncDue(subscription, now)`: true when `isActive && encryptedUrl && (!lastSyncAt || now - lastSyncAt >= syncIntervalMinutes * 60_000)`. This mirrors `scheduler.rs` (holiday feeds keep their weekly interval).
   - `CalendarApiService.syncDueSubscriptions()` syncs due feeds one at a time with their decrypted URL.
   - Shared hook `packages/calendar-client/src/use-feed-sync.ts` `useFeedSync({ api, enabled, onSynced })`: `useQuery` on `FEED_SYNC_QUERY_KEY` with `refetchInterval: 15 * 60_000`, `refetchIntervalInBackground: false` and `retry: false`. It invalidates the events and subscriptions keys when anything synced. It runs only in Calendar (web calendar page, native-calendar), never in Mail.
6. **Dedupe.**
   - The server keeps no keyed hash.
   - `createSubscription` compares the normalized URL against the decrypted `getSubscriptions()` list and throws "You are already subscribed to this calendar URL". The server's `by_url` check still covers readable rows.
   - A two-device race only creates a duplicate feed, which is harmless.
7. **Migration of existing rows.**
   - `EncryptionUpgrades.subscriptionsWithReadableUrls: Vec<SubscriptionId>` lists rows where `encrypted_url IS NULL`.
   - `sealSubscriptionUrls` in `encryption-upgrade.ts` reads the readable `url` from `getSubscriptions()` and calls `updateSubscription(id, { url })`. The client seals `url` into `UpdateSubscriptionRequest.encryptedUrl`.
   - The server writes `encrypted_url` and the placeholder in `queries::update_feed`, which clears the plaintext. An overwrite of an already sealed row is allowed, because only the owner's own clients send it.
8. **Reminders when no client is open.** Nothing changes, because feed events never had reminders. The only effect is that mirrored events go stale until a Calendar client opens. That client syncs due feeds within seconds, and the view refreshes through invalidation.
9. **Verdict.** The trade-off is good; proceed. Rejected alternative: native fetches the feed directly, so the server never sees the URL. Web cannot do this (CORS), it would need two code paths, and it would move SSRF-style risk onto devices. It is a possible follow-up together with E2EE feed events.

**Changes.**
- **crates/solace-api-types + apps/backend**
  - Migration `cargo xtask migrate new sealed_feed_url`: `ALTER TABLE calendar_subscription ADD COLUMN encrypted_url TEXT`. Then run `cargo xtask entities`.
  - `subscriptions.rs`:
    - `CalendarSubscription.encrypted_url: Option<String>` (`#[schema(required = true)]`).
    - `CreateSubscriptionRequest.encrypted_url` and `UpdateSubscriptionRequest.encrypted_url`.
    - New `SyncSubscriptionRequest`.
  - `e2ee.rs`: `EncryptionUpgrades.subscriptions_with_readable_urls`.
  - `subscriptions/routes.rs`: schemas `:22-40`, with `encryptedUrl` as `zod::string().min(1).max(4096).optional()`; `sync` takes `ValidJson<SyncSubscriptionRequest>`.
  - `subscriptions/service.rs`: `create`, `update` (`FeedChanges.sealed_url`), `sync`, `sync_feed`, `mirror`, `dto`.
  - `subscriptions/queries.rs`: `insert_feed` (placeholder from the id it assigns), `update_feed`, `due`.
  - `subscriptions/scheduler.rs`: pass `&feed.url`.
  - `e2ee/upgrades.rs`: `subscriptions_with_readable_urls`.
  - `cargo xtask openapi`.
- **packages/calendar-core**:
  - `content-encryption.ts`: `SUBSCRIPTION_URL_AAD`.
  - New `subscription-feed.ts`.
  - Types: `UpdateSubscriptionRequest.url?` (client-only, sealed before sending).
- **packages/calendar-client**:
  - `calendar-api-service.ts`:
    - `hydrateSubscription` (`:1279`) opens `encryptedUrl` into `url`; on failure it keeps the placeholder and the feed is not synced.
    - `createSubscription` (`:1313`) dedupes and seals.
    - `updateSubscription` (`:1328`) seals `url`.
    - `syncSubscription(id, url?)` (`:1358`).
    - New `syncDueSubscriptions`.
  - `encryption-upgrade.ts`: `sealSubscriptionUrls`, and `UpgradeApi` picks.
  - New `use-feed-sync.ts`.
  - `index.ts`.
- **apps/web**:
  - `hooks/use-subscriptions.ts`: `useSyncSubscriptionMutation` passes `subscription.url`; new `useFeedSyncWhileOpen()`, used in `app/calendar/_client.tsx`.
  - No visual change, because the UI already renders `subscription.url`.
- **apps/native-calendar**:
  - `src/hooks/use-calendar-management.ts:91` `useSyncSubscription` passes the URL; `useFeedSyncWhileOpen()`, used in `app/calendar/index.tsx`.
  - `refetchIntervalInBackground: false` relies on the existing `focusManager`/AppState wiring.
- **apps/notifications**: none.

**Compatibility.**
- Shipped binaries:
  - They still create readable subscriptions, which the server keeps syncing until a new client's sweep seals them.
  - They show the `sealed:<id>` placeholder as the URL of sealed feeds.
  - Their manual sync of a sealed feed gets 400 "Update the app to sync this calendar."
  - Only Calendar clients updated by OTA refresh sealed feeds.
- Deploy overlap: the column is nullable and ignored by the old API. An old instance's scheduler may try `sealed:<id>` and record one `UnsupportedScheme` error on the feed, until the next client sync overwrites the status.
- Existing data: sealed lazily by the sweep, after which the plaintext column holds only the placeholder.
- A later PR can drop `url`'s plaintext role once no readable rows remain (§3: drop only after the old code is gone).

**Tests.**
- Backend unit tests in `subscriptions/service.rs` (it has `feed_server()`):
  - A sealed create stores only the ciphertext and `sealed:<id>`, and the initial sync mirrors through the transient URL.
  - `due` skips sealed rows.
- API suite `subscriptions.rs` (feeds are inserted directly; nothing local is fetchable):
  - A sealed row synced without `url` answers 400.
  - A sync with a body `url` of `http://127.0.0.1/…` records `PRIVATE_NETWORK`, which proves the body URL was used and the stored one was not.
  - `PUT` with `encryptedUrl` replaces `url` with the placeholder.
  - The list returns `encryptedUrl`.
  - A sealed create with a private URL is refused and stores nothing.
- `encryption_upgrades.rs`: a readable feed is listed in `subscriptionsWithReadableUrls` and drops out after sealing.
- Client tests:
  - New `packages/calendar-client/src/__tests__/subscription-url-sealing.test.ts`:
    - Create sends `encryptedUrl` and rejects duplicates from the decrypted list.
    - `syncDueSubscriptions` honours `syncIntervalMinutes` and sends the decrypted URL.
    - A URL that does not open is never synced.
  - Extend `encryption-upgrade.test.ts`.
  - `packages/calendar-core` unit test for `isFeedSyncDue`.

**Docs.**
- AGENTS.md §2: change "(a feed's name is sealed as its mirrored calendar's name, `encryptedName` on `/api/subscriptions`)" to:

  > "(a feed's name is sealed as its mirrored calendar's name, `encryptedName` on `/api/subscriptions`, and its URL is sealed on the device, `encryptedUrl`, AAD `subscription-url:v1`; the API receives the URL only in a sync request body, never stores or logs it, and syncs sealed feeds only when a Calendar client asks)".
- In the upgrades sentence, add "readable feed URLs" after "readable feed names".

**Decisions.**
- Sealed URL in a per-row column, not in sealed preferences. **Default: column.**
- Server keyed hash for dedupe. **Default: none** (the client dedupes).
- Placeholder `sealed:<id>` instead of a schema change to `url`. **Default: yes.**
- Client cadence: on open, then every 15 minutes while visible, honouring `syncIntervalMinutes`. **Default: yes.**
- Bind the URL AAD to the subscription id. **Default: no.**
- Go ahead given the trade-off. **Default: yes**, because feed events have no reminders.

---

## Mail safety: links, trackers, unsubscribe, photo metadata, hostile-parser property tests

Shared ground for M1–M4, verified in code (line numbers as of `ee7fb551`):

- **The web reader cannot see clicks.** `apps/web/components/mail/message-reader/html-email-renderer.tsx:39-50` renders `srcDoc` with `sandbox="allow-popups allow-popups-to-escape-sandbox"`, no `allow-scripts`, no `allow-same-origin`; the document has `script-src 'none'` (`packages/calendar-core/src/mail-html.ts:287-302`) and `<base target="_blank">` (`mail-html.ts:328`); the sanitizer forces `target="_blank" rel="noopener noreferrer"` on every `a[href]` (`packages/calendar-core/src/sanitize-email-html.ts:164-166` tokenizer path, `:265-270` DOMPurify path). With no script, an opaque origin and no top-navigation token, the parent gets no event and cannot read which link was clicked. The only thing Solace controls is the markup: **rewrite `href`s at sanitize time to a same-origin page that opens in the new tab the click already creates.** That page is the "web link handoff" built in M1 and reused by M2.
- **Rejected web alternatives:** (a) `allow-top-navigation-by-user-activation` + `target="_top"` to a `#fragment` of the reader page: weakens the frame (one sanitizer slip lets a mail replace the Solace tab with a look-alike sign-in page), and the srcdoc base URL is captured at creation, so after a `pushState` the click becomes a full reload. (b) The URL in the handoff fragment: works, but §2 says no PII in URLs and browsers keep the fragment in history. (c) `allow-scripts`: forbidden by §2.
- **The native reader can see clicks.** `apps/native-mail/src/components/mail/HtmlEmailView.tsx:34-66` already injects `FIT_AND_REPORT_SCRIPT` (native `injectedJavaScript` is not bound by the page CSP), and `onMessage` (`:114-120`) already parses `h:` messages. Today `onShouldStartLoadWithRequest` (`:123-131`) opens only http(s) via `WebBrowser.openBrowserAsync`. **mailto:/tel: never reach it:** `react-native-webview` 14.0.1 checks `originWhitelist` first (`node_modules/react-native-webview/src/WebViewShared.tsx:38-64`) and hands non-whitelisted URLs straight to `Linking.canOpenURL`/`openURL`, and `originWhitelist` is `["about:blank","data:","http://*","https://*"]` (`HtmlEmailView.tsx:139`). With no `LSApplicationQueriesSchemes` in the Expo config, iOS `canOpenURL` usually says false and the link silently does nothing.
- **Hermes has no WHATWG URL.** React Native 0.88's `URL` (`node_modules/react-native/Libraries/Blob/URL.js:134-160`) gets `hostname` from a regex: no IDNA/punycode, no `\` normalization, no lowercasing. `mail-simplelogin.ts:176` already avoids it. Shared host logic must therefore (1) run only on *canonical* URLs, from the browser's `new URL(...).href` on web or the WebView's `a.href`/navigation URL on native, which serialize IDN hosts as `xn--` ASCII, and (2) use a small regex parser in calendar-core. Do not use `Intl`, `\p{Script=…}` regexes or punycode helpers.
- **Mail preferences already have a sealed home.** `MailSyncedSettings` (`packages/calendar-core/src/mail-synced-settings.ts:19-27`) is AES-GCM under the account key (`MAIL_SYNCED_SETTINGS_AAD`). Its `display` and `compose` parts are normalized by `normalizeMailDisplaySettings` (`mail-display-settings.ts:70-120`) and `normalizeMailComposeSettings` (`mail-compose-settings.ts:56-80`). New mail toggles go there, not in calendar's `user-settings-preferences.ts`, which holds calendar/app preferences.

---

### M1. mailto:/tel: links in received mail
**Effort** M · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-mail
**Why.** Clicking a `mailto:` link in a message should open a Solace compose with the link's fields filled in, not the OS mail app (web) or nothing at all (native). `tel:` should dial on native.
**Current state.**
- The sanitizer keeps `mailto:`/`tel:` hrefs: `sanitize-email-html.ts:53-55`, and DOMPurify `ALLOWED_URI_REGEXP` at `:298`.
- Web: the click opens a new window → OS handler, because of `<base target="_blank">` (`mail-html.ts:328`) and `allow-popups-to-escape-sandbox` (`html-email-renderer.tsx:42`).
- Native: dropped or handed to `Linking` by the library (see shared ground).
- There is already a mailto parser, but it is SimpleLogin-only: `parseMailtoTarget` (`packages/calendar-core/src/mail-simplelogin.ts:146-174`). It already treats `+` as literal per RFC 6068.
- Web compose seeding: `getMailComposeBridge()` + `seedNewMessage` (`apps/web/components/mail/recipient-popover.tsx:48-56`, `mail-compose-types.ts:42`, `use-mail-compose-controller.tsx:376-381`, `buildNewMessageSeed` in `mail-compose-seed.ts:211-247`).
- Native compose seeding: `useMailCompose().openCompose(request)` (`apps/native-mail/src/providers/MailComposeProvider.tsx:38-43`) with `ComposeRequest { mode, messageId, to, toName }` (`apps/native-mail/src/lib/mail/compose-request.ts:4-9`). `planComposeSeed` handles `params.to` (`compose-seed.ts:81-93`), and seeded cc/bcc auto-expand (`compose-form.ts:44`).
**Design.**
- One parser in calendar-core, `parseMailtoLink(href): MailtoDraft | null`, with `MailtoDraft = { to: string[]; cc: string[]; bcc: string[]; subject: string; body: string }`:
  - Returns null unless the trimmed href starts with `mailto:` (case-insensitive) and is at most `MAILTO_MAX_LENGTH = 16_384` characters.
  - Drops `#…`. Splits path and query at the first `?`. Query pairs split on `&`; keys are case-insensitive.
  - Percent-decodes with a `decodeURIComponent` try/catch; a component that fails to decode is skipped. Never use `URLSearchParams`, because `+` must stay literal.
  - Path, `to`, `cc` and `bcc` split on `,`. Each entry goes through `parseRecipientString` and `isValidEmailAddress` (`mail-addresses.ts:20,53`). Duplicates (case-insensitive) are dropped and each field is capped at `MAILTO_MAX_RECIPIENTS = 50`.
  - `subject`: the first one wins; C0 controls and DEL become spaces; trimmed; capped at `MAILTO_MAX_SUBJECT_LENGTH = 998`.
  - `body`: the first one wins; CRLF/CR become `\n`; controls other than `\n`/`\t` are stripped; capped at `MAILTO_MAX_BODY_LENGTH = 10_000`.
  - Every other key (`in-reply-to`, …) is ignored.
  - `mailto:` with nothing after it returns an all-empty draft, which opens a blank compose.
- `tel:`: native calls `Linking.openURL(href)`; iOS asks before dialing and Android opens the dialer. Web keeps the browser default (new window → OS handler); there is nothing better without scripts.
- **`navigator.registerProtocolHandler`: not in this PR.** Its template needs `%s`, and every Gmail-style template puts the whole `mailto:` (addresses, subject, body) into a query string the server receives, which breaks §2 "No PII in URLs". A fragment template (`/mail/link#%s`) would keep it off the server but still puts the address in history, and it makes Solace the system-wide mailto handler, which is a product decision. Follow-up.
- **Web link handoff (shared with M2):**
  - `processEmailHtml` gains an option `rewriteLink?: (link: { href: string; text: string }) => string | null` (details in M2). On web, `HtmlEmailRenderer` rewrites every `mailto:` href to `${location.origin}/mail/link#<token>.<index>`, where `token = crypto.randomUUID()` is created once per renderer mount via `useState(() => …)`.
  - The `(id, {href, text})` pairs collected while building `srcDoc` go into an in-memory registry in an effect. The registry is a module `Map` capped at 2,000 entries (oldest evicted) and cleared on sign-out.
  - The click opens `/mail/link#<id>` in a new tab, as it already would. That page drops the fragment (`history.replaceState`) and asks over `BroadcastChannel("solace:mail-link")`: `{type:"resolve", id}`. The reader tab's responder (started once in `MailApp`) answers `{type:"resolved", id, href, text}`. Both directions are validated with strict Zod schemas from `@workspace/calendar-core/zod`; the id must match `^[0-9a-f-]{36}\.\d{1,5}$`, `href` ≤ 16,384 characters and `text` ≤ 512.
  - With no answer within 5 s the page shows "This link has expired. Open it again from the message."
  - For a `mailto:`, the page stores the parsed draft in a module-level pending slot and `router.replace("/mail")`. The compose controller consumes the slot once identities are loaded and calls a new `seedMailto(draft)`. Compose opens in the new tab.
  - Only an opaque random id is ever in a URL.
**Changes.**
- packages/calendar-core
  - New `src/mail-mailto.ts`: `MailtoDraft`, the four `MAILTO_*` constants, `parseMailtoLink`. Export it from `src/index.ts`.
  - `src/mail-simplelogin.ts`: `parseMailtoTarget` (`:146-174`) calls `parseMailtoLink` and keeps only drafts with exactly one recipient on `SIMPLELOGIN_REVERSE_ALIAS_DOMAIN`. Defaults stay. This deletes the duplicate pair parsing.
- apps/web
  - New `lib/mail/mail-link-handoff.ts`:
    - Constants `MAIL_LINK_CHANNEL`, `MAIL_LINK_PATH = "/mail/link"`.
    - `mailLinkHandoffUrl(id)`, `registerMailLinks(entries)`, `clearMailLinkHandoff()`.
    - `startMailLinkResponder(): () => void`, `resolveMailLink(id, timeoutMs = 5000): Promise<{href,text} | null>`.
    - `setPendingMailto(draft)` / `takePendingMailto()`.
  - `lib/auth-local-state.ts`: call `clearMailLinkHandoff()` in `clearSolaceClientAuthArtifacts` (`:41-57`), `clearOrphanedClientAuthArtifacts` and `signOutAndClearLocalState`.
  - `components/mail/mail-app.tsx:54`: `useEffect(() => startMailLinkResponder(), [])`. A BroadcastChannel subscription is an external system, so an effect is right here.
  - `components/mail/message-reader/html-email-renderer.tsx`: take a `confirmExternalLinks` prop (M2), create the token, pass `rewriteLink`, register the collected pairs in an effect. The local array is filled during render; per §5, a fresh local array is not React state.
  - New route `app/mail/link/page.tsx`, a server component with `metadata = { title: "Open link", referrer: "no-referrer", robots: { index: false } }`, rendering `app/mail/link/_client.tsx` (`MailLinkPageContent`, `"use client"`). It reads the hash in an effect, then resolves → mailto: pending + `router.replace("/mail")`, or http(s): the M2 confirm.
  - `components/mail/mail-compose-seed.ts`: new `buildMailtoSeed(draft, identities, resolvedIdentityId): SeedResult`, modeled on `buildNewMessageSeed`:
    - `composeTo`/`Cc`/`Bcc` are the arrays joined with `", "`.
    - The body goes before `buildNewComposeBodies(identity)`'s signature. In plain-text mode that is `draft.body + seeded.body`; otherwise `<p>${escapeHtml(body).replace(/\n/g,"<br>")}</p>` + `seeded.htmlBody`.
    - `composeMode: "new"`, `isComposeOpen: true`.
  - `components/mail/mail-compose-types.ts:42`: add `seedMailto: (draft: MailtoDraft) => void` to `MailComposeBridge`. Implement it next to `seedNewMessage` in `use-mail-compose-controller.tsx:376` and add it to the bridge object (`:446`). Add the pending-slot consumer there as an effect keyed on identities being loaded.
- apps/native-mail
  - `src/lib/mail/compose-request.ts`: add `mailto?: MailtoDraft`.
  - `src/lib/mail/compose-seed.ts`: before the `params.to` branch (`:81`), `if (params.mailto)` returns `{ kind: "fields", fields: { to, cc, bcc (joined ", "), subject, body } }`.
  - `src/components/mail/HtmlEmailView.tsx`:
    - New required prop `onLinkPress: (link: { href: string; text: string }) => void`.
    - Prepend a capture-phase click listener to `FIT_AND_REPORT_SCRIPT`. It finds `e.target.closest('a[href]')`, calls `preventDefault()` and posts `'link:' + JSON.stringify({ href: a.href, text: (a.textContent || '').slice(0, 512) })`.
    - `onMessage` parses `link:` messages with `JSON.parse` in try/catch plus a strict Zod schema, then calls `onLinkPress`.
    - Add `"mailto:*"` and `"tel:*"` to `originWhitelist` so the fallback `onShouldStartLoadWithRequest` sees them. It returns false for them and for http(s), and sends them to `onLinkPress({ href: url, text: "" })` instead of calling `WebBrowser` directly.
  - New `src/hooks/use-mail-link-press.ts`, `useMailLinkPress()`:
    - `mailto:` → `parseMailtoLink` → `openCompose({ mailto })`, or a toast "This email link can't be opened." when it returns null.
    - `tel:` → `Linking.openURL(href).catch(() => toast(...))`.
    - http(s) → M2.
    - Anything else is ignored. That includes `about:blank#…` fragment links, which were already blocked.
  - `src/components/mail/MailMessageBody.tsx:188-195`: pass `onLinkPress={useMailLinkPress()}`, called at the top of the component.
**Compatibility.**
- The native changes are JS only and work as an OTA on current binaries: `Linking`, `expo-web-browser` and `react-native-webview` are already linked.
- On web, the handoff page and the reader ship in the same deploy. A reader tab still on the old bundle simply doesn't rewrite links. After a rollback, a rewritten link would 404 until the tab reloads.
- No server, API or stored data change.
**Tests.**
- New `packages/calendar-core/src/__tests__/mail-mailto.test.ts`:
  - RFC 6068 examples: `+` literal, `%2C` inside an address, repeated `to=`, case-insensitive keys, `%0D%0A` body.
  - Rejects `javascript:` and over-long links.
  - Respects the caps and drops invalid addresses.
- `mail-simplelogin.test.ts` still passes unchanged.
- `apps/web/__tests__/components/mail-compose-seed.test.ts`: `buildMailtoSeed` in rich and plain-text mode, with signature placement.
- New `apps/web/__tests__/lib/mail-link-handoff.test.ts`:
  - register/resolve round trip with a mocked `BroadcastChannel`.
  - Unknown id → null after the timeout; malformed messages are ignored.
  - `clearMailLinkHandoff` empties the registry.
  - The eviction cap.
- New `apps/web/__tests__/app/mail-link-page.test.tsx`: the fragment is dropped; mailto routes to `/mail` with the pending draft; the expired state.
- `apps/web/__tests__/components/html-email-renderer.test.tsx`: the srcDoc contains no `mailto:` href, only `/mail/link#<uuid>.<n>`.
- `apps/web/__tests__/lib/auth-local-state.test.ts`: the handoff is cleared.
- `apps/native-mail/src/lib/mail/compose-seed.test.ts`: the mailto branch.
- `apps/native-mail/src/components/mail/HtmlEmailView.test.tsx`: the mock captures `onMessage`/`injectedJavaScript`/`originWhitelist`. A `link:` message calls `onLinkPress`; malformed JSON is ignored; the whitelist has mailto/tel.
- New `apps/native-mail/src/hooks/use-mail-link-press.test.tsx`: mailto → `openCompose`, tel → `Linking.openURL`.
**Docs.**
- Root AGENTS.md §1 map, web row: change "Routes `/calendar`, `/mail`, `/login`," to "Routes `/calendar`, `/mail` (plus `/mail/link`, which opens links clicked in mail), `/login`,".
- `apps/web/AGENTS.md`: add one line: "Links clicked in mail open `/mail/link#<opaque id>` in a new tab; the reader tab answers over `BroadcastChannel` `solace:mail-link` and the page drops the fragment on load, so no mail URL or address ever sits in a Solace URL."
**Decisions.**
- Web mailto opens compose in the new tab the click creates, not the reader tab. **Default: new tab.** Same-tab compose would need top navigation from the frame (rejected above).
- `registerProtocolHandler`. **Default: not in this PR**; follow-up issue with a fragment template.

### M2. Link protection
**Effort** L · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-mail
**Why.** Before a link opens, show its real host; warn on look-alike hosts and on link text that names a different domain; strip click-tracking parameters. All of this runs on the device.
**Current state.**
- Native opens any http(s) link immediately (`HtmlEmailView.tsx:123-131`). Web opens it in a new tab with no check (shared ground).
- No tracking-parameter stripping anywhere.
- `isSafeEmailUrl` (`sanitize-email-html.ts:44-64`) only filters schemes.
- Display toggles live in `MailDisplaySettings` (`mail-display-settings.ts:6-13`, defaults `:35-42`). They are persisted locally on web by `serializeDisplayPreferences` (`apps/web/lib/mail/mail-display-settings.ts:33-42`, typed `satisfies Omit<MailDisplaySettings,"trustedSenders">`, so a missing field fails typecheck) and synced through the sealed `MailSyncedSettings`.
- UI patterns:
  - Web confirms use `Dialog` from `@workspace/ui/components/ui/dialog` (`message-reader-simplelogin.tsx:26-33`).
  - Native confirms use `Alert.alert` (`MailSimpleLoginRow.tsx:172-183`).
  - Settings switches: web `mail-display-settings-panel.tsx:85-100`, native `MailDisplaySettingsContent.tsx:125-130`.
**Design.**
- New calendar-core `src/mail-links.ts` (regex only, Hermes-safe):
  - `getLinkHost(url): string | null` for absolute http(s) URLs: `^https?:\/\/(?:[^@\/?#\\]*@)?(\[[^\]]*\]|[^:\/?#\\]*)`. The result is lowercased with any trailing `.` removed; null otherwise.
  - `TRACKING_QUERY_PARAMS`, our own list of unambiguous tracker keys: `fbclid gclid gclsrc dclid gbraid wbraid msclkid twclid ttclid li_fat_id mc_cid mc_eid igshid yclid _hsenc _hsmi __hstc __hssc __hsfp mkt_tok oly_anon_id oly_enc_id vero_id vero_conv ml_subscriber ml_subscriber_hash rb_clickid s_cid wickedid _openstat`, plus any key starting with `utm_`. Generic names such as `ref`, `source` and `trk` are left alone.
  - `stripTrackingParams(href): string`:
    - Only touches `^https?:` hrefs. Splits off `#…` and the query; drops pairs whose decoded, lowercased key matches; keeps the remaining pairs byte-for-byte and in order; drops an empty `?`.
    - Idempotent.
  - `assessMailLink(canonicalUrl, text): MailLinkAssessment`, returning `{ host: string; textHost: string | null; warnings: MailLinkWarning[] }`, where `MailLinkWarning = "international-host" | "text-mismatch"`:
    - `international-host`: the host has a non-ASCII character or any `xn--` label. All IDNs warn; this is stricter and simpler than mixed-script detection, which needs Unicode script data Hermes lacks.
    - `textHost`: the trimmed text matches `^<?(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,63})(?::\d+)?(?:[\/?#]\S*)?>?$`i.
    - `text-mismatch`: `textHost` is set and the two hosts are not "same site". After stripping a leading `www.`, two hosts are the same site when they are equal or one ends with `"." + other`. This is a deliberate heuristic without the PSL: it also flags tracking redirectors, which is a true statement.
  - `describeMailLink(assessment): { title: string; lines: string[] }`: shared copy so both platforms say the same thing.
    - Title: "Open this link?"
    - Lines: `Opens ${host}.`; for an international host, "This address uses international or look-alike characters. Check that it's the site you expect."; for a mismatch, `The link text shows ${textHost}, but it opens ${host}.`
- `processEmailHtml` (`mail-html.ts:258-284`) gets one linear anchor pass, after the image filter (`:268-274`) and before darkening and the final sanitize (`:282-283`, so the final pass still re-sanitizes everything).
  - For every `<a … href>` it decodes the href (`decodeHtmlEntities`) and applies `stripTrackingParams`.
  - If `options.rewriteLink` returns a string, that becomes the href and `title` is set to the original href clipped to 200 characters, replacing any sender title. Hover would otherwise show only `/mail/link`.
  - Values are written back escaped: `&`→`&amp;`, `"`→`&quot;`, `<`, `>`.
  - Link text: from the open tag to the next `<a`/`</a>`, run through `stripHtmlTags` + `decodeHtmlEntities`, whitespace collapsed, clipped to 512.
  - **It must stay linear.** The tokenizer path can leave `<a>` unclosed, so `<a[^>]*>([\s\S]*?)<\/a>` would be quadratic. Do a single tag scan that records positions, then rebuild.
  - It runs on both platforms, so native WebViews get stripped hrefs too.
- Preference `MailDisplaySettings.confirmExternalLinks: boolean`, default `true`. Off means links without warnings open directly; **links with warnings always confirm**.
  - Web settings copy: "Confirm links before opening", with the description "Shows where a link goes. Suspicious links always ask."
- Web:
  - `HtmlEmailRenderer`'s `rewriteLink` hands off absolute http(s) links when `confirmExternalLinks` is on, or when `assessMailLink(new URL(href).href, text)` has warnings. A `new URL` failure means no rewrite. mailto links are always handed off (M1).
  - The `/mail/link` page canonicalizes with `new URL(href)`, which gives WHATWG + IDNA, so the hostname is shown as `xn--…`. It renders `describeMailLink`, the full URL clipped to 300 characters in muted text, and buttons "Open link" (`Button`, `@workspace/ui`) / "Cancel".
  - Open: `window.location.replace(url.href)`. With the route's `no-referrer` metadata and the tab's absent opener, the destination gets neither a referrer nor `window.opener`.
  - Cancel: `window.close()`; if the tab is still open, `router.replace("/mail")`.
- Native: `useMailLinkPress` (M1) handles http(s):
  - `assessMailLink(href, text)`; `href` is already canonical from the WebView.
  - If confirm is off and there are no warnings, `WebBrowser.openBrowserAsync(href)`.
  - Otherwise `Alert.alert(title, [...lines, clippedUrl].join("\n\n"), [Cancel, Open])`. That matches the SimpleLogin confirm pattern; a confirm is not secondary UI that needs a drawer.
**Changes.**
- packages/calendar-core
  - New `src/mail-links.ts` as above; export it from `src/index.ts`.
  - `src/mail-html.ts`: add `rewriteLink?` to `ProcessEmailHtmlOptions` (`:7-14`) and an internal `rewriteEmailAnchors(html, rewriteLink)` used by `processEmailHtml`.
  - `src/mail-display-settings.ts`: field, default, and `booleanOr` normalization.
- apps/web
  - `lib/mail/mail-display-settings.ts:33-42`: add the field to `serializeDisplayPreferences`.
  - `components/mail/mail-display-settings-panel.tsx`: the switch.
  - `components/mail/message-reader/message-reader-body.tsx:127-133`: pass `confirmExternalLinks={displaySettings.confirmExternalLinks}`.
  - `html-email-renderer.tsx` and `app/mail/link/_client.tsx`: as above.
- apps/native-mail
  - `src/hooks/use-mail-link-press.ts`: the http(s) branch, reading `useMailDisplaySettings()`.
  - `src/components/settings/sections/MailDisplaySettingsContent.tsx`: the switch.
**Compatibility.**
- Older clients drop the unknown display field when they rewrite the synced blob (`normalizeMailDisplaySettings`), so it falls back to the safe default `true`.
- Tracking stripping changes only rendered hrefs, never stored mail.
**Tests.**
- New `packages/calendar-core/src/__tests__/mail-links.test.ts`:
  - `getLinkHost`: userinfo, IPv6, port, trailing dot, uppercase, non-http.
  - `stripTrackingParams`: keeps other params, their order and the fragment; idempotent.
  - `assessMailLink`: `xn--pple-43d.com`, `аpple.com` (raw Cyrillic), `www.` handling, subdomain both ways, text `paypal.com` vs host `paypal.com.evil.test`.
  - `describeMailLink` copy.
- `packages/calendar-core/src/__tests__/mail-html.test.ts`:
  - `utm_*`/`fbclid` removed from `<a href>` on both sanitizer paths.
  - The `rewriteLink` result and the `title` are applied.
  - `&` is re-escaped (guards the `&copy=` misparse).
- `src/__tests__/mail-html-hostile-input.test.ts`: add a `"link rewrite"` entry point (`processEmailHtml` with a `rewriteLink` that always rewrites) plus units `"<a href=x>"` and `"<a href=x"`; the existing 64 KB / 1500 ms budget catches quadratic regressions.
- `apps/web/__tests__/components/html-email-renderer.test.tsx`: confirm on → http(s) rewritten; confirm off → only warned links rewritten.
- `apps/web/__tests__/app/mail-link-page.test.tsx`: the warnings render; Open calls `location.replace` with the canonical URL.
- `apps/web/__tests__/lib/mail-display-settings.test.ts` and `packages/calendar-core/src/__tests__/mail-display-settings.test.ts`: the default and normalization.
- `apps/native-mail/src/hooks/use-mail-link-press.test.tsx`: Alert shown or skipped; Open → `openBrowserAsync`.
**Docs.** Root AGENTS.md §2 "Secure coding", the bullet "Mail HTML: always sanitize, render in a sandboxed iframe **without scripts**, block remote content by default." gets this appended: "Links go through the on-device link check (`calendar-core` `mail-links.ts`: tracking parameters stripped, the real host shown before opening, look-alike and mismatched hosts flagged); web reaches it through `/mail/link`, which receives only an opaque id over a same-origin `BroadcastChannel`, never the URL."
**Decisions.**
- Every IDN host warns, not just mixed-script ones. **Default: all.** Simpler, and Hermes-safe.
- Confirm by default. **Default: on; warned links always confirm.**
- Tracking stripping cannot be turned off. **Default: always on, no setting.** Ceiling: a signed URL that covers a `utm_*` parameter would break; add an escape only when a real report shows up.

### M3. Tracker blocking by URL + visible count
**Effort** M · **Risk** low · **Touches** packages/calendar-core, apps/web, apps/native-mail
**Why.** Pixels are blocked only by size, and silently. Known open-tracking endpoints of any size should stay blocked even after the user loads images, and the reader should say what it blocked.
**Current state.**
- `isTrackingPixelTag` (`mail-html.ts:418-424`) checks only width/height ≤ 2. It is applied in `processEmailHtml` (`:268-274`) only when `blockTrackingPixels` is on (the default is `true`, `mail-display-settings.ts:39`).
- `emailHtmlHasRemoteContent` (`mail-html.ts:409-416`) is called by web `use-message-reader-controller.tsx:501-509`, native `MailMessageBody.tsx:76-80`, `mail-html-hostile-input.test.ts`, `mail-html.test.ts` and `apps/web/__tests__/lib/mail-display-settings.test.ts`.
- The remote-content banners are at web `message-reader-body.tsx:92-125` and native `MailMessageBody.tsx:174-187` / `RemoteContentBanner`.
**Design.**
- New calendar-core `src/mail-trackers.ts` with a hand-written list. It is not derived from EasyPrivacy (GPL/CC BY-SA) or Disconnect, so there is no notice or licensing work.
  - `KNOWN_MAIL_TRACKERS: ReadonlyArray<{ host: string; path?: string }>`. Host matching is `host === rule.host || host.endsWith("." + rule.host)`. Path matching is `pathname === path`, or a prefix match when `path` ends in `/`.
  - Initial entries: `list-manage.com /track/open.php`, `mandrillapp.com /track/open.php`, `sendgrid.net /wf/open`, `awstrack.me /I0/`, `customeriomail.com /e/o/`, `mailtrack.io /trace/mail/`, `emltrk.com`, `r.superhuman.com`, `t.yesware.com`, `mailfoogae.appspot.com`, `getnotify.com`, `google-analytics.com /collect`, `doubleclick.net`, `facebook.com /tr`.
  - **The implementer verifies each entry against a real sample before merge and drops any they cannot confirm.**
  - `matchKnownTracker(src): string | null` returns the image host. The URL is normalized like `isRemoteUrl` (`mail-html.ts:355-362`): strip controls, `\`→`/`, and `//host` becomes `https://host`. Host and path come from `getLinkHost` (M2) plus a path regex.
  - `EmailTrackerSummary = { count: number; hosts: string[] }`, where hosts are unique and sorted with `.sort()` on a fresh array (`toSorted` is banned on Hermes).
  - `getMailTrackerNotice(summary): { label: string; detail: string }`:
    - Label: `Blocked ${count} tracker${count === 1 ? "" : "s"}`.
    - Detail: "Senders use these to learn when and where you open their mail. They never load, even after you load images."
- `processEmailHtml`: when `blockTrackingPixels` is on, drop an `<img>` if `isTrackingPixelTag(tag) || matchKnownTracker(src)`. This runs regardless of `blockRemoteImages`, so trackers stay blocked after "Load images". It also removes a `background` attribute on `BACKGROUND_ATTRIBUTE_TAGS` (`:384-386`) whose URL matches.
  - Ceiling: tracker URLs inside CSS `url()` load once remote content is allowed. Follow-up if it shows up in practice.
- Replace `emailHtmlHasRemoteContent` with `analyzeEmailHtml(options): { hasRemoteContent: boolean; trackers: EmailTrackerSummary }`, a single sanitize pass. An internal `processEmailHtmlInternal(options, onBlockedTracker?)` collects the remote images it removes as trackers: a size-based pixel counts only when its src is remote. With `blockTrackingPixels` off, the summary is `{count: 0, hosts: []}`.
- UI, shown when `count > 0`, above the HTML body:
  - Web: a one-line `ShieldCheck` row (lucide) with the label and a `DropdownPanel` (`@workspace/ui/solace`) listing the hosts plus the detail. Muted tokens; the brown `accent` only on hover text.
  - Native: a new `MailTrackerRow`, a line + `BottomSheet` copied from `MailSimpleLoginRow` (`Modal` + `BottomSheet` + `SheetSection`/`SheetItem`), Feather `shield`.
**Changes.**
- packages/calendar-core: new `src/mail-trackers.ts` (exported); in `src/mail-html.ts`, add `analyzeEmailHtml`, remove `emailHtmlHasRemoteContent`, and extend the image filter.
- apps/web:
  - `use-message-reader-controller.tsx:501-509` uses `analyzeEmailHtml` and exposes `trackers` on the view model (`:598` area).
  - `message-reader-body.tsx` renders the new `MessageReaderTrackerLine`, a new component in `message-reader/message-reader-trackers.tsx`.
- apps/native-mail: `MailMessageBody.tsx:76-86` uses `analyzeEmailHtml`; new `src/components/mail/MailTrackerRow.tsx`, rendered before `RemoteContentBanner` (`:174`).
**Compatibility.** Rendering only; no stored data. The existing `blockTrackingPixels` toggle now also governs URL-matched trackers. Its label can stay; on both platforms its description becomes "Blocks known trackers and tiny tracking images."
**Tests.**
- New `packages/calendar-core/src/__tests__/mail-trackers.test.ts`: each rule matches its sample; near misses do not (`evil-list-manage.com`, `/track/open.php.png`); protocol-relative and backslash srcs.
- `mail-html.test.ts`:
  - A 600×200 known-tracker image is removed even with `blockRemoteImages: false`.
  - `analyzeEmailHtml` counts and dedupes hosts.
  - With `blockTrackingPixels: false` nothing is counted.
- `mail-html-hostile-input.test.ts`: rename the `"remote content check"` entry to `analyzeEmailHtml`.
- `apps/web/__tests__/lib/mail-display-settings.test.ts`: update the call.
- `apps/web/__tests__/components/message-reader.test.tsx`: the row and the host list.
- New `apps/native-mail/src/components/mail/MailTrackerRow.test.tsx`.
**Docs.** Append to the same §2 "Mail HTML" sentence edited in M2: "Known trackers (`calendar-core` `mail-trackers.ts`) stay blocked even after remote images are allowed."
**Decisions.**
- Seed list scope. **Default: the 14 open-tracking endpoints above, verified; no third-party list.**
- CSS `url()` trackers. **Default: follow-up.**

### M4. Unsubscribe for any mail with List-Unsubscribe
**Effort** M · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-mail
**Why.** Unsubscribe exists only for SimpleLogin forwards. Every list mail with an authenticated `List-Unsubscribe` should get it, executed from the device and never through the Solace server. A server-side subscription catalog would violate §2.
**Current state.**
- `header:List-Unsubscribe:asURLs` is already fetched through `SIMPLELOGIN_JMAP_PROPERTIES` (`mail-simplelogin.ts:15-22`):
  - Web: `apps/web/lib/mail/jmap-client.ts:233-256` `EMAIL_FULL_GET_PROPERTIES`, with Zod in `apps/web/lib/mail/types.ts:259`.
  - Native: `apps/native-mail/src/lib/mail/jmap-client.ts:197-201` `EMAIL_DETAIL_GET_PROPERTIES`, with the type `apps/native-mail/src/lib/mail/types.ts:93`.
- `List-Unsubscribe-Post` is not fetched.
- The run path already exists for SimpleLogin:
  - Web: `apps/web/hooks/use-simplelogin-alias-action.ts:40-121`.
  - Native: `useSimpleLoginAliasAction` in `apps/native-mail/src/lib/mail/use-mail.ts:757-845`.
  - Either way it is `mailto` → `runMailSendAction` + `sealMailForSelf` + `client.sendMessage` (both clients route that through `sendJmapMessage`: web `jmap-client.ts:1504`, native `:1112`), from the receiving identity (`resolveMessageReplyFrom`); or `https` → open externally. The done keyword is `$unsubscribed` (`SIMPLELOGIN_DONE_KEYWORD`, `mail-simplelogin.ts:27`).
- **The web CSP blocks a one-click POST from the page:**
  - `connect-src` is `'self' apiOrigin blob: data:` in production (`apps/web/lib/security-headers.ts:40-50`) and `form-action` is `'self' apiOrigin` (`:58`).
  - The srcdoc frame inherits it and adds `form-action 'none'`.
  - Native has no CSP.
- Trusted DKIM result: `parseAuthResults(getTrustedAuthResultsHeader(message))` (`mail-auth-results.ts:26-66`).
**Design.**
- New calendar-core `src/mail-unsubscribe.ts`:
  - `LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY = "header:List-Unsubscribe-Post:asText"`.
  - `MailUnsubscribeFields` (List-Unsubscribe asURLs + Post asText + `MailAuthResultsFields`).
  - `MAIL_UNSUBSCRIBED_KEYWORD = "$unsubscribed"`. `SIMPLELOGIN_DONE_KEYWORD` becomes `= MAIL_UNSUBSCRIBED_KEYWORD`, a one-line alias with the same value, so existing marks keep working.
  - `MailUnsubscribeTarget = { type: "one-click"; url } | { type: "mailto"; to; subject; body } | { type: "https"; url }`.
  - `getMailUnsubscribe(message, { allowOneClick: boolean }): { targets: MailUnsubscribeTarget[]; host: string | null } | null`. It returns null when:
    - `getSimpleLoginForward(message)` is set (SimpleLogin keeps its own line);
    - DKIM is not `pass`, as RFC 8058 requires for one-click; applied to every method so spoofed lists cannot phish;
    - no usable target exists.
  - It considers at most 8 URLs, each ≤ 2,048 characters.
  - Target order:
    1. One-click: only when `allowOneClick`, the Post value trimmed and compared case-insensitively equals `List-Unsubscribe=One-Click`, and there is an `https:` URL.
    2. The first `mailto:` whose `parseMailtoLink` (M1) gives exactly one recipient. Subject defaults to "Unsubscribe", body to "Please unsubscribe me."
    3. The first `https:` URL. `http:` is refused.
  - https and one-click hosts must look public: from `getLinkHost`, contain a dot, not be an IP literal, and not end in `.local`, `.localhost`, `.internal`, `.lan` or `.home.arpa`. Otherwise a DKIM-passing sender could make the phone POST to a LAN device.
  - `describeMailUnsubscribe(first, address)` gives the confirm copy:
    - One-click: `Solace asks ${host} to remove ${address} from this list. The sender sees your IP address.`
    - mailto: `Solace sends an unsubscribe email from ${address} to ${to}.`
    - https: `Opens the sender's unsubscribe page at ${host}.`
    - Title "Unsubscribe?", action "Unsubscribe", pending "Unsubscribing…", done "Unsubscribed".
- Execution, after the confirm, tries targets in order until one succeeds:
  - One-click is native only: `fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click", credentials: "omit", redirect: "follow", signal })` with a 15 s `AbortController` timeout. Success is `response.ok`. Never log the URL; it carries list tokens.
  - mailto goes through the existing send path; the external recipient means a plaintext submit plus a self-sealed Sent copy, per §8.
  - https opens externally: web `window.open(url, "_blank", "noopener,noreferrer")`, native `WebBrowser.openBrowserAsync`.
  - Then set `MAIL_UNSUBSCRIBED_KEYWORD` optimistically, the same way the SimpleLogin hooks do (`trackKeywordWrite` on web, cache patch + rollback on native).
- Web passes `allowOneClick: false`, so it uses mailto → https. **This is a stated single-platform difference (CSP).** Widening `connect-src` to `https:` would undo an exfiltration defense.
- No server involvement: no API, no catalog, no logging.
- **Subscriptions view: follow-up.** The on-device index (`mail-body-index.ts`, `title-search-index.ts`) stores no `List-Unsubscribe`, so building it means a new indexed field plus a new screen; not M effort.
**Changes.**
- packages/calendar-core: new `src/mail-unsubscribe.ts` (exported); `src/mail-simplelogin.ts:27` keyword alias.
- apps/web:
  - `lib/mail/jmap-client.ts:252` adds `LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY`.
  - `lib/mail/types.ts:259`: `"header:List-Unsubscribe-Post:asText": jmapOptional(z.string().optional())`.
  - New `lib/mail/send-mail-command.ts`, `sendMailCommand(activeMailbox, message, { to, subject, body })`, extracted from `use-simplelogin-alias-action.ts:70-109`; the SimpleLogin hook uses it.
  - New `hooks/use-mail-unsubscribe-action.ts`.
  - `components/mail/message-reader-types.ts:56`: `onUnsubscribe?: (message) => void`, wired in `mail-app/mail-app-detail-pane.tsx:160`.
  - New `message-reader/message-reader-unsubscribe.tsx`: a header line "Unsubscribe" or "Unsubscribed" with lucide `BellOff`, plus a `Dialog` confirm. Rendered next to `MessageReaderSimpleLoginLine` in `message-reader-header.tsx:108`.
- apps/native-mail:
  - `src/lib/mail/jmap-client.ts:197-201` adds the property; `src/lib/mail/types.ts:93` intersects `MailUnsubscribeFields`.
  - New `src/lib/mail/send-mail-command.ts`, extracted from `use-mail.ts:795-827`.
  - New `src/lib/mail/one-click-unsubscribe.ts`, `postOneClickUnsubscribe(url)`, with `// repo-rules-allow client-api-boundary: RFC 8058 one-click unsubscribe POST to the list sender, from the device`.
  - `use-mail.ts`: new `useMailUnsubscribeAction(runtime)`, a `useMutation` with the same optimistic keyword pattern as `:770-844`.
  - `src/hooks/use-mail-message-actions.ts`: `handleUnsubscribe`, passed through `app/mail/message/[id].tsx:255`.
  - New `src/components/mail/MailUnsubscribeRow.tsx`, a Pressable line with Feather `bell-off` and an `Alert` confirm, rendered next to `MailSimpleLoginRow` in `MailMessageHeader.tsx:124`.
**Compatibility.**
- Additive JMAP property; Stalwart returns null when the header is absent.
- The native offline snapshot (`mail-offline-store.ts`) stores the extra header field inside the already-encrypted message objects.
- Older binaries ignore the field.
- The keyword value is unchanged, so SimpleLogin "done" marks are unaffected.
- No API change.
**Tests.**
- New `packages/calendar-core/src/__tests__/mail-unsubscribe.test.ts`:
  - RFC 8058 header present or absent, with Post-value case and whitespace.
  - DKIM fail → null; SimpleLogin forward → null.
  - LAN, IP and `http:` URLs refused; target order; mailto defaults; caps.
- `mail-simplelogin.test.ts` is unchanged and green.
- `apps/web/__tests__/components/message-reader.test.tsx`: the line, the confirm, the done state.
- New `apps/web/__tests__/hooks/use-mail-unsubscribe-action.test.ts`: mailto via the mocked `client.sendMessage`, the https fallback, keyword rollback on failure.
- `apps/native-mail/src/hooks/use-mail-message-actions.test.tsx`: the one-click POST body and headers, fallback to mailto on a non-2xx response, keyword rollback.
- `apps/native-mail/src/lib/mail/outgoing-send.test.ts`: still green with the extracted `sendMailCommand`.
**Docs.** Root AGENTS.md §8: after "Inbound-mail push is enqueued only from the HMAC-signed Stalwart webhook (`POST /api/internal/stalwart/webhook`).", add: "Unsubscribe (`List-Unsubscribe`, RFC 2369/8058; `calendar-core` `mail-unsubscribe.ts`) runs only on the device and only for DKIM-passing mail: native sends the one-click POST itself; web, whose CSP blocks it, falls back to the mailto command through `sendJmapMessage` or the sender's https page; never through the API."
**Decisions.**
- Require DKIM pass for every method. **Default: yes.**
- One-click on web. **Done:** `/mail/link` submits a real form POST, which only that route's `form-action https:` allows; `connect-src` is never widened.
- Subscriptions view. **Default: follow-up issue.**

### M5. Strip image metadata from outgoing attachments
**Effort** M · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-mail
**Why.** Photos attached to mail carry EXIF/GPS and camera data to every recipient, sealed or not. Profile pictures are already re-encoded on the device (`packages/native-core/src/lib/profile-picture.ts:3-59`); mail attachments are not.
**Current state.**
- Web adds files through `pickOutgoingAttachmentFiles` (calendar-core `mail-outgoing-attachments.ts:142-157`) in three places:
  - `apps/web/components/mail/compose-dialog.tsx:496-508` `handleFileChange` and `:516-523` `addDroppedFiles`;
  - the quick reply, `use-message-reader-controller.tsx:451-463` `handleFileSelect`;
  - inline/pasted images, `apps/web/hooks/use-mail-app.ts:1586-1612` `handleComposeImageUpload` → `registerComposeInlineImage` (`lib/mail/compose-inline-images.ts:58`).
- Native has only `pickComposeAttachment` (`apps/native-mail/src/components/mail/ComposeSheet.tsx:405-438`). It uses `DocumentPicker`, reads base64, then deletes the plaintext cache copy. There are no inline images on native.
- `expo-image-manipulator ~58.0.16` is a native-mail dependency (`apps/native-mail/package.json:60`, since 2026-09-28) and is used lazily with an update fallback in `profile-picture.ts:6-13`.
**Design.**
- New calendar-core `src/mail-image-metadata.ts`, pure and Hermes-safe:
  - `IMAGE_REENCODE_JPEG_QUALITY = 0.92`, `IMAGE_REENCODE_MAX_PIXELS = 16_777_216` (iOS Safari's canvas cap; larger images are scaled down, aspect kept).
  - `planImageMetadataStrip({ name, type, bytes }): { action: "keep" } | { action: "reencode"; outputType: "image/jpeg" | "image/png" | "image/webp"; outputName: string }`.
  - The type is trusted only when the magic bytes agree: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF….WEBP`, HEIC/HEIF `ftyp` brand `heic|heix|mif1|msf1`.
  - Mapping: JPEG→JPEG, PNG→PNG, WebP→WebP, HEIC→JPEG (the name gets `.jpg`).
  - Keep unchanged: GIF; animated PNG (an `acTL` chunk before `IDAT`); animated WebP (the `VP8X` flags byte has the animation bit `0x02`); anything else.
- Setting `MailComposeSettings.stripImageMetadata: boolean`, default `true`, synced through the sealed `MailSyncedSettings`. Copy: "Remove photo location" with "Removes location and camera details from attached photos."
  - A per-attachment "send original" is a follow-up.
- Web, new `apps/web/lib/mail/strip-image-metadata.ts`, `stripImageMetadata(file): Promise<{ file: File; stripped: boolean }>`:
  - Plan, then `createImageBitmap(file)`. The default `imageOrientation: "from-image"` applies EXIF rotation.
  - Scale to `MAX_PIXELS`, draw on an `OffscreenCanvas` (`HTMLCanvasElement` as a fallback), `convertToBlob`/`toBlob({ type, quality })`, close the bitmap.
  - If `blob.type` differs (Safari has no WebP encoding), use the returned type and fix the extension.
  - On a decode failure (for example HEIC in Chrome or Firefox), return the original. The caller toasts "Couldn't remove location data from {name}. It's attached as is."
  - All in memory; nothing touches disk.
  - The four call sites run it before `pickOutgoingAttachmentFiles`, so size limits apply to the re-encoded bytes. They become async with `.then/.catch`, not `?.`/`??` inside `try`, because of the React Compiler 1.0 limits in §5.
- Native, new `apps/native-mail/src/lib/mail/strip-image-metadata.ts`, `stripPickedImageMetadata(asset, bytes): Promise<{ name; type; bytes } | null>`:
  - Lazy `import("expo-image-manipulator")` as in `profile-picture.ts:6-13`. If the import fails, return null and the caller toasts "Update Solace to remove photo location data."
  - `ImageManipulator.manipulate(asset.uri)`, with `.resize` when over `MAX_PIXELS`, then `.renderAsync()` → `saveAsync({ format, compress: 0.92, base64: true })`.
  - Delete the saved cache file in `finally`, exactly as `profile-picture.ts:46-57` does, because the cache copy is plaintext.
  - `pickComposeAttachment` gains a `stripMetadata: boolean` parameter (from `composeSettings.stripImageMetadata`). It strips after reading and before deleting `asset.uri`, then re-checks `getOutgoingAttachmentSizeError`.
  - **Verify on device that Android applies EXIF orientation**, using a rotated test photo; this is a manual QA step listed in the PR.
**Changes.**
- packages/calendar-core: new `src/mail-image-metadata.ts` (exported); in `src/mail-compose-settings.ts`, the field, the default (`:43-50`) and normalization (`:56-80`).
- apps/web: new `lib/mail/strip-image-metadata.ts`; the four call sites above; the switch in `components/mail/compose-settings-panel.tsx` (next to `:30`).
- apps/native-mail: new `src/lib/mail/strip-image-metadata.ts`; `ComposeSheet.tsx:405-438`; the switch in `src/components/settings/sections/ComposeSettingsContent.tsx` (next to `:62`).
**Compatibility.**
- JS only. Shipped native binaries include `expo-image-manipulator` (dependency since 2026-09-28); the lazy import covers anything older.
- Older clients reset the unknown compose field to the default `true` when they rewrite the synced blob.
- Already-sent mail and drafts are unchanged.
**Tests.**
- New `packages/calendar-core/src/__tests__/mail-image-metadata.test.ts`: magic-byte fixtures (tiny hand-built byte arrays) for JPEG, PNG, APNG, WebP still/animated, GIF and HEIC brand; a type mismatch → keep; output names.
- `src/__tests__/mail-compose-settings.test.ts`: the default.
- New `apps/web/__tests__/lib/strip-image-metadata.test.ts`: jsdom has no canvas, so mock `createImageBitmap`/`OffscreenCanvas`. Covers: re-encode called with the right type and quality, the downscale math, the HEIC decode failure → original + `stripped: false`, GIF untouched.
- `apps/web/__tests__/components/compose-form.test.tsx`: an attached JPEG goes through the stripper when the setting is on and not when it is off.
- New `apps/native-mail/src/lib/mail/strip-image-metadata.test.ts`: mocks the manipulator; asserts the format mapping, cache deletion on success and failure, and the import-failure fallback.
- `src/components/mail/ComposeSheet.test.tsx`: picker flow.
**Docs.** Root AGENTS.md §2 "Data minimization", after the sentence starting "Uploaded profile pictures are re-encoded on-device (no EXIF)…", add: "Outgoing image attachments and inline images are re-encoded on the device too (`calendar-core` `mail-image-metadata.ts`, compose setting `stripImageMetadata`, on by default), so location and camera metadata never leave it; GIFs and animated images are sent as is."
**Decisions.**
- When re-encoding fails. **Default: attach the original and warn**, not block.
- Escape hatch. **Default: the setting only; per-attachment "send original" is a follow-up.**
- Pixel cap. **Default: 16.7 MP on every browser**, for one predictable result.

### T1. Property tests for hostile parsers
**Effort** M · **Risk** low · **Touches** packages/calendar-core (tests only, plus fixes for any counterexample found)
**Why.** Mail MIME, mail HTML and ICS are attacker-controlled. The example tests (`sanitize-email-html.cases.ts`, `mail-html-hostile-input.test.ts`) cover known bypasses and linear time, but not invariants over generated input.
**Current state.**
- `fast-check ^4.10.2` is a calendar-core devDependency (`packages/calendar-core/package.json:19-21`). It is used by `date-utils.property.test.ts`, `navigation-period.property.test.ts`, `validation.property.test.ts`, `view-model.property.test.ts` and `week-start-day.property.test.ts`, with arbitraries in `src/__tests__/property-test-arbitraries.ts`.
- `packages/calendar-ics` has no fast-check. **No new dependency is needed:** calendar-core already depends on `@workspace/calendar-ics`, and the hostile on-device surfaces live in calendar-core:
  - `parseIcsImport` (`ics-import.ts:203`);
  - `parseMailCalendarInviteFromIcs` (`mail-calendar-invite.ts:190`);
  - the builder `buildIcsEventFile` (`packages/calendar-ics/src/index.ts:623`).
  
  calendar-ics's `parseICSFile` (node-ical) has no production caller since the Rust API, so it is out of scope.
- jest: `testEnvironment: "node"` (`packages/calendar-core/jest.config.cjs`) runs the tokenizer path of `sanitizeUntrustedEmailHtml`. A `/** @jest-environment jsdom */` docblock runs the DOMPurify path (`sanitize-email-html.dom.test.ts:1`).
- Known throws:
  - `readMailMimeLeaves` (`mail-mime-limits.ts:140-205`) throws seven fixed messages.
  - `parseIcsImport` throws "Invalid calendar file" and "Calendar file contains too many events" and reports everything else in `errors`.
**Design.**
- Use fixed `numRuns` per property (listed below) and fast-check's default random seed; a failure prints the seed and path to replay. Target under 3 s per file and under 15 s added in total.
- Oracles are independent of the code under test. Do not reuse `isSafeEmailUrl` or the sanitizer's tag lists as the oracle.
- **Any counterexample is a bug, fixed in this PR**, with the shrunk input added to `sanitize-email-html.cases.ts` or to the parser's example test.
- Comments are one line each (the existing property files have multi-line JSDoc; do not copy that).
**Changes.** New and extended files in `packages/calendar-core/src/__tests__/`:
- `property-test-arbitraries.ts` gains:
  - `hostileHtmlArb`: `fc.array(fc.oneof(...tokens, fc.string({ maxLength: 8 })), { maxLength: 60 }).map(join)`. Tokens:
    - tags: allowed tags, `script`/`style`/`svg`/`math`/`iframe`/`template`/`noscript`/`plaintext`/`base`/`meta`/`form`, plus `</`, `>`, `<!--`, `-->`, `<![CDATA[`;
    - attributes: `href`/`src`/`background`/`style`/`onclick`/`onerror`/`srcset`/`formaction`/`xlink:href`/`data-x`, with unbalanced quotes;
    - URLs: `javascript:`, `java\tscript:`, `&#106;avascript:`, `JaVaScRiPt:`, `vbscript:`, `data:text/html,`, `data:image/png;base64,AA`, `https://e.test/?utm_source=x`, `//e.test`, `cid:x`, `mailto:a@b.test`;
    - CSS: `expression(`, `url(`, `\3c`;
    - `\u0000`, ` `.
  - `mimeSoupArb`: header and boundary fragments, `\r\n\r\n`, `Content-Transfer-Encoding: base64|quoted-printable|8bit`, encoded words, long lines.
  - `icsEventArb`: the `IcsBuildEventInput` fields.
    - title/description/location: strings with `,;\\\n` and astral characters.
    - start: minute-aligned within 2000–2099; duration 1–10,080 minutes; `allDay` aligned to dates.
    - timezone from `["UTC","Europe/Amsterdam","America/New_York","Asia/Kolkata","America/St_Johns","Australia/Lord_Howe","Pacific/Chatham"]`.
    - optional recurrence: frequency, interval 1–4, `count` 1–20 xor `until`, `byWeekDay` subset.
- `sanitize-email-html.property.test.ts` (node, tokenizer path), 300 runs each, for profiles `reader` and `compose`:
  - (1) Never throws, and is idempotent: `s(s(x)) === s(x)`.
  - (2) Safe output. Scan tags with `/<([a-z][a-z0-9-]*)\b([^>]*)>/gi` and attributes with a local regex:
    - no tag outside a test-local allow-list, and `style` only in reader;
    - no attribute named `on*`, `srcset`, `formaction` or `xlink:href`;
    - for `href`/`src`/`background`/`cite`: the decoded value (`decodeHtmlEntities`), with C0, whitespace and `\x7f-\x9f` stripped and lowercased, has no scheme or one of `http`/`https`/`mailto`/`tel`(href only)/`cid`/`blob`(img src only), or is `data:image/(png|gif|jpe?g|webp|bmp|avif)[;,]` for img src only;
    - no `expression(`/`-moz-binding`/`javascript:` inside `style` attributes or blocks after `decodeCssEscapes`.
  - (3) `processEmailHtml` with both `isDark` values, `blockRemoteImages: true` and `blockTrackingPixels: true` satisfies (2), has no `<img` with a remote src, and (with M2) has no tracking key in any `a[href]`.
- `sanitize-email-html.dom.property.test.ts` (`/** @jest-environment jsdom */`, DOMPurify path): (1) and (2), 100 runs.
- `mail-mime-parser.property.test.ts`:
  - (1) `parseMailMimeContent(mimeSoup or fc.string, { text: 64, html: 64 })` either returns `text === null || text.length <= 64` and `html === null || html.length <= 64`, or throws an `Error` whose message is in a test-local set built from the `throw new Error(` messages in `mail-mime-limits.ts`/`mail-mime-parser.ts`. 300 runs.
  - (2) Round trip, 150 runs: `buildOutgoingMimeMessage({ text, html?, attachments? })` (`outgoing-mime.ts:98`; filenames from a safe alphabet; `contentType` from a list; `content` = `fc.uint8Array({ maxLength: 2048 })`) → `parseMailMimeContent(raw)` with display limits gives:
    - `text` equal to the input with line endings normalized and trimmed;
    - `html` equal when given;
    - attachment bytes, names and types equal and in order;
    - `truncated === false`.
  - (3) Truncation, 200 runs: a single `text/plain` 7bit part with a body of length L and `limits.text = K` → `text.length <= K` and `truncated === (L_trimmed > K)`.
  - (4) `parseDecryptedMailContent` on non-MIME text: same bounds. 200 runs.
- `ics-import.property.test.ts`:
  - (1) `parseIcsImport(fc.string or ICS token soup)` throws only the two known messages; otherwise every event has `start < end` and ISO strings. 200 runs.
  - (2) Mutation: drop, duplicate or truncate lines of a generated valid file → same contract as (1). 100 runs.
  - (3) Round trip: `buildIcsEventFile({ calendar: { name: "x" }, event })` → `parseIcsImport(ics, "UTC")` gives 1 event and 0 errors. Title, description, location and timezone are equal. Timed start/end are equal to the millisecond. All-day dates follow the import's end − 1 ms rule (`ics-import.ts:145`); copy the expectation style of `all-day-event-timezone.test.ts`. Recurrence frequency, interval, count/until and byWeekDay are equal. 100 runs.
  - (4) `parseMailCalendarInviteFromIcs(arbitrary)` never throws and returns null or an invite. 200 runs.
- `mail-links.property.test.ts`, covering the new parsers from M1/M2/M4/M5, 300 runs each:
  - `parseMailtoLink` never throws and respects every cap. Draft → `mailto:` built with `encodeURIComponent` → parse is the identity for valid addresses.
  - `stripTrackingParams` is idempotent, removes every tracking key, keeps non-tracking pairs in order, and leaves non-http input unchanged.
  - `getLinkHost` never throws, and its result has no `@ / ? # \`.
  - `getMailUnsubscribe` never throws, and its targets only use `https`/`mailto` with public-looking hosts.
  - `planImageMetadataStrip` never throws on random bytes.
**Compatibility.** Tests only; CI time grows by about 10–15 s across these files.
**Tests.** The files above; `bun run test` (calendar-core workspace) runs them.
**Docs.** None.
**Decisions.**
- Seed policy. **Default: random seed with fixed `numRuns`**; counterexamples are real bugs, fixed in the PR.
- Where the ICS properties live. **Default: calendar-core, no fast-check in calendar-ics.**
- Sanitizer idempotence may fail on the DOMPurify path because of HTML re-serialization. **Default: treat it as a bug.** If the root cause is a benign serializer normalization, assert stability after two passes and record the reason in a one-line comment.

---

## Mail: M6–M10

Ground rules for all five items (verified in code, 2026-11-14, branch `ui/reduce-encryption-notices` @ `ee7fb551`):

- **Where mail preferences are sealed.** Mail preferences do *not* live in `user_settings.encrypted_preferences` (`packages/calendar-core/src/user-settings-preferences.ts:10-25` lists only calendar/app fields). They sync as their own AES-GCM blob: `MailSyncedSettings { display, compose, list }`, sealed with the account key under AAD `mail-settings:v1` (`packages/calendar-core/src/mail-synced-settings.ts:19-26,64-89`), stored opaque by `GET/PUT /api/mail-settings` (`apps/backend/src/mail_settings.rs:28-44`). Web keeps a local copy in localStorage and syncs (`apps/web/lib/e2ee-mail-settings.ts`, `apps/web/lib/mail/mail-list-settings.ts:22-43`). Native keeps it in SecureStore and syncs (`apps/native-mail/src/lib/mail/e2ee-mail-settings.ts`, `apps/native-mail/src/hooks/use-mail-settings.ts:29-92`, key `QUERY_KEYS.mailSyncedSettings()`). **Every new mail preference below is a new field in `MailComposeSettings` or `MailListSettings`, normalized field by field in calendar-core.** No backend, migration or API-contract change.
- **No backend change in M6–M10.** The API's JMAP proxy only allowlists paths (`apps/backend/src/mail/proxy.rs:72-80` `is_allowed_pathname`: `/jmap`, `/jmap/`, `/jmap/session`, upload/download/eventsource); it never filters methods or capabilities and passes the session through (clients only rewrite URLs: `normalizeJmapSession`, `apps/web/lib/mail/jmap-client.ts:189-202`). All new calls go to `/jmap/`, already admitted by `apps/stalwart/backend-gate.cfg` (`acl api_jmap path /jmap /.well-known/jmap`, `path_beg /jmap/`). So: no `backend-gate.cfg` edit, no `cargo xtask openapi`, no API-suite case required.
- **Duplicated JMAP clients.** `apps/web/lib/mail/jmap-client.ts` and `apps/native-mail/src/lib/mail/jmap-client.ts` are parallel copies. Put every request builder, Zod response parser and pure rule in `packages/calendar-core`, and keep each client method a thin wrapper around `this.call(session, using, calls)`.
- **Code rules that apply throughout.** Comments are one line. Hermes lacks `toSorted`/`Object.groupBy`, so use `[...xs].sort()`. React Compiler 1.0 skips any function with `?.`, `??`, `&&`, `||` or `?:` inside a `try`; use an inner async function plus `.catch`. Query keys come from the factories (`apps/web/lib/mail/mail-query-keys.ts`, `packages/native-core/src/lib/query-keys.ts`). `useQuery`/`useMutation` live in `use-*.ts` domain hooks.
- **Stalwart verification is runtime-only.** No Stalwart source is checked out locally. The pinned build is 1.1.0 at commit `e7cde9b3fac32d2a254ef782efec56f2373ec5d4` (`apps/stalwart/scripts/build-stalwart.sh:4`). The protocol behaviour M6/M7 depend on is therefore asserted by one new disposable probe, `apps/stalwart/tests/probe_jmap_send_features.py` (spec under M7 → Tests), wired into `.github/workflows/pr-tests.yml` next to the subject probe (`:127-128`). **Implement the probe first; if it fails, stop and report rather than shipping M6/M7 UI.**

---

### M6. Vacation responder (JMAP VacationResponse)
**Effort** M · **Risk** med · **Touches** packages/calendar-core, packages/native-core, apps/web, apps/native-mail, apps/stalwart (probe only)

**Why.** An away auto-reply is a baseline mail feature, and today it is missing. Stalwart 1.1.0 already implements RFC 8621 §8 `VacationResponse`, so this is client work over the existing JMAP proxy. The one catch is that the reply text must be readable by the server, which sends it.

**Current state.**
- Nothing in the apps uses VacationResponse or Sieve. A grep of `apps/ packages/ crates/` for `VacationResponse|SieveScript|vacation` finds only unrelated calendar strings.
- Stalwart 1.1.0 schema:
  - `objects.VacationResponse` is `{"type":"singleton", "permissionPrefix":"jmapVacationResponse"}`.
  - `fields.VacationResponse.properties` = `isEnabled` (bool), `fromDate`/`toDate` (utcDateTime | null), `subject`, `textBody`, `htmlBody` (all nullable) (`apps/stalwart/stalwart/cli-schema.json`).
  - The user-Sieve interpreter `x:SieveUserInterpreter` defaults are `defaultSubject` "Automated reply", `defaultSubjectPrefix` "Auto: ", `defaultExpiryVacation` 30 d, and its own `dkimSignDomain` = `if is_local_domain(sender_domain) then sender_domain`.
- The OAuth client is first-party with scopes `mail` and `settings` (`apps/stalwart/stalwart/plan/15-oauth-webadmin.ndjson:3`). The schema says "First-party applications have full access to the account", so bridge tokens may call `VacationResponse/*`.
- Both `JmapSession` types already carry `capabilities?: Record<string, unknown>` (`apps/web/lib/mail/types.ts:53`, `apps/native-mail/src/lib/mail/types.ts:45`). Clients send `using` per call (e.g. `apps/web/lib/mail/jmap-client.ts:565`; native `:1489-1530` `call`/`executeCall`).
- Settings navigation:
  - Shared ids: `packages/calendar-core/src/settings-navigation.ts:14-20` (`SettingsMailId`) and `:83-114` (`SETTINGS_MAIL_ITEMS`).
  - Native icons: `packages/native-core/src/lib/settings-nav-icons.ts:18-25`.
  - Native drawer pages: `apps/native-mail/src/components/MailAccountSheet.tsx:34-44`. Mailboxes is drawer-only, filtered out of the standalone stack at `apps/native-mail/src/components/settings/sections/MailSettingsContent.tsx:24-27`.
  - Web hub: `apps/web/components/mail/mail-settings-navigation.ts:11-91`.
  - Web palette views: `apps/web/components/mail/mail-command-palette-ui-state.ts` (`MailPaletteView`) and `mail-command-palette-view-content.tsx:350-376`.

**Design.**
- **Plaintext by necessity, disclosed.** The server must read the subject and text to send the reply, so neither is sealed. A shared copy constant, `VACATION_REPLY_SERVER_NOTICE` = "Your mail server keeps this reply unencrypted because it sends it for you. Leave out anything private.", is shown on both platforms directly under the message field. It is not hidden behind a toggle.
- **Text only.** Always write `htmlBody: null` and `textBody` = the user's text. We never author HTML, so there is no sanitizer surface. `subject: null` when blank, so the server default applies.
- **Dates use the user's configured time zone** (`resolveTimezone(settings.timezone)`). The UI edits whole days as `YYYY-MM-DD`.
  - `fromDate = toJmapUtcDate(fromDay, tz)`, reusing `packages/calendar-core/src/mail-search-filter.ts` `toJmapUtcDate`, which already returns the start of that day in tz without milliseconds.
  - `toDate = toJmapUtcDate(dayAfter(toDay), tz)`, an exclusive end at the start of the following day. Empty day → `null`.
  - Reading back uses `utcToPickerDate(new Date(x), tz)`, then `formatCalendarDayKey`; for `toDate`, subtract one day.
- **Capability gate.**
  - `VACATION_RESPONSE_CAPABILITY = "urn:ietf:params:jmap:vacationresponse"`.
  - `supportsVacationResponse(session)` = the key is present in `session.capabilities`.
  - Account id = `session.primaryAccounts[VACATION_RESPONSE_CAPABILITY] ?? <primary mail account id>`.
  - Unsupported → the page shows "Auto-reply isn't available on this mail server." and no form.
- **Validation** (shared, throws user-facing messages):
  - Enabled requires non-blank text.
  - `VACATION_REPLY_MAX_CHARS = 5000` for the text, `VACATION_SUBJECT_MAX_CHARS = 200`.
  - `toDay >= fromDay`.
  - Responses are parsed with Zod (`z.object`, unknown keys stripped; hostile JMAP).
- **Data layer.**
  - One query: `VacationResponse/get ids:["singleton"]`.
  - One mutation: `VacationResponse/set update.singleton`, with optimistic `setQueryData` on the precise key, rollback on error and invalidate of that key on settle.
  - The editable form is local state seeded from query data via a keyed child (`key={dataUpdatedAt}`), not an effect.
- **Native placement.** The page is drawer-only (`AccountSheet` page, no Expo Router route), exactly like Mailboxes.

**Changes.**
- **packages/calendar-core**
  - New `src/mail-vacation-response.ts`, exported from `src/index.ts`, containing:
    - Constants: `VACATION_RESPONSE_CAPABILITY`, `VACATION_REPLY_SERVER_NOTICE`, `VACATION_REPLY_MAX_CHARS`, `VACATION_SUBJECT_MAX_CHARS`.
    - `vacationResponseSchema` (Zod).
    - `type MailVacationForm = { enabled: boolean; fromDay: string; toDay: string; subject: string; text: string }`.
    - `vacationResponseToForm(response, timezone)` and `vacationFormToUpdate(form, timezone)`. The latter returns `{ isEnabled, fromDate, toDate, subject, textBody, htmlBody: null }` and throws on invalid input.
    - `buildVacationResponseGetCall(accountId)` and `buildVacationResponseSetCall(accountId, update)`, both returning `JmapMethodCallLike`.
    - `parseVacationResponseGet(result)` and `assertVacationResponseSet(result)`. The latter requires `updated.singleton` and maps `notUpdated.singleton.description` to an Error.
    - `supportsVacationResponse(session)` and `vacationResponseAccountId(session, mailAccountId)`.
  - `src/settings-navigation.ts`:
    - Add `"auto-reply"` to `SettingsMailId`.
    - Append `{ id: "auto-reply", label: "Auto-reply", description: "Reply automatically while you're away" }` to `SETTINGS_MAIL_ITEMS`.
- **packages/native-core**
  - `src/lib/query-keys.ts`: `mailVacationResponse: () => ["mail", "vacationResponse"] as const`.
  - `src/lib/settings-nav-icons.ts`: `"auto-reply": "corner-up-left"` in `SETTINGS_MAIL_ICONS`.
- **apps/web**
  - `lib/mail/jmap-client.ts`: `getVacationResponse(session)` and `setVacationResponse(session, update)` using the shared builders, with `using: ["urn:ietf:params:jmap:core", VACATION_RESPONSE_CAPABILITY]`.
  - `lib/mail/mail-query-keys.ts`: `vacationResponse: (userId: string | null) => [...mailQueryKeys.all, "vacation-response", userId] as const`.
  - New `hooks/use-mail-vacation-response.ts`, taking `(connection: { client; session } | null, userId)`. The query is enabled only when connected and supported.
  - New `components/mail/vacation-reply-settings-panel.tsx`. It is a `PaletteView title="Auto-reply"` containing:
    - `SettingToggleRow` "Send auto-reply".
    - Two `<input type="date">` fields in `PaletteField`s ("First day", "Last day", both optional).
    - `Input` subject (placeholder "Automated reply").
    - `Textarea` message (`@workspace/ui/components/ui/textarea`).
    - The notice in `text-muted-foreground`.
    - A Save button, compact inline field errors, and toast on failure.
  - Wiring:
    - `components/mail/mail-settings-navigation.ts`: add the `MailSettingsView` member and a nav item (lucide `Reply`, keywords `["vacation","away","out of office","auto reply","autoresponder"]`).
    - `mail-command-palette-ui-state.ts`: add `"auto-reply"` to `MailPaletteView`.
    - `mail-command-palette-view-content.tsx`: render the panel. Pass the active mailbox's `{ client, session }` through a new `mailConnection` prop on `MailCommandPaletteViewContentProps`, sourced from `activeMailbox` in the controller.
- **apps/native-mail**
  - `src/lib/mail/jmap-client.ts`: the same two methods.
  - New `src/hooks/use-mail-vacation-response.ts`, using `QUERY_KEYS.mailVacationResponse()` and the runtime from `useMailRuntime`.
  - New `src/components/settings/sections/VacationReplySettingsContent.tsx`. It is `SettingsPage title="Auto-reply"` containing:
    - `SheetSwitchItem`.
    - Two `SheetTextField` day fields (`YYYY-MM-DD`, validated with `isValidSearchDate`, styled like `src/components/mail/MailFilterSheet.tsx:285-310`).
    - A subject field and a multiline message field.
    - The notice as the `SheetSection` footer, and a `SheetButton` "Save".
  - `src/components/MailAccountSheet.tsx`: add `"auto-reply": VacationReplySettingsContent` to `pages`.
  - `src/components/settings/sections/MailSettingsContent.tsx:24-27`: also filter out `"auto-reply"` when not in the sheet (drawer-only).
  - `src/lib/settings-search-entries.ts`: add an entry `{ pageId: "auto-reply", label: "Auto-reply", location: "Auto-reply", keywords: "vacation away out of office" }`.
- **apps/stalwart**: probe assertions only (see M7 → Tests). No plan change.

**Compatibility.** Server state is per account, and the singleton is shared by web and native. Shipped binaries don't show the page but are unaffected. Nothing is stored in Postgres or on disk; the query cache is cleared on sign-out (`queryClient.clear()`).

**Tests.**
- `packages/calendar-core/src/__tests__/mail-vacation-response.test.ts` (new):
  - Form↔update round trip in `Europe/Amsterdam` across the late-October DST change.
  - `toDate` is an exclusive end of day.
  - Enabled without text is refused, and over-length text is refused.
  - `htmlBody` is always `null`.
  - An unsupported session is reported as unsupported.
  - A hostile response with wrong types is rejected.
- `packages/calendar-core/src/__tests__/settings-navigation.test.ts`: the new item is present on both platforms.
- `apps/web/__tests__/lib/mail-jmap.test.ts` and `apps/native-mail/src/lib/mail/jmap-client.test.ts`: request shape, `using` includes the capability, and a set failure surfaces as an error.
- `apps/web/__tests__/components/vacation-reply-settings-panel.test.tsx` (new): notice rendered, save calls the mutation with `htmlBody: null`, unsupported state shown.
- The Stalwart probe (M7) checks the capability is advertised and that `VacationResponse/set` then `/get` round-trips for a plain `User`-role account.

**Docs.** In root `AGENTS.md` §2, change "The only plaintext exceptions are … and the transient `invitationContent` copy for invitation mail (never persisted)." to append: ", and the mail auto-reply (`VacationResponse` subject and text, which Stalwart must read to send; both settings pages say so)".

**Decisions.**
1. **DKIM on auto-replies.** Stalwart signs Sieve-generated mail through `x:SieveUserInterpreter.dkimSignDomain` (default `is_local_domain(sender_domain)`), separate from `MtaStageData.dkimSignDomain` in `plan/30-mta.ndjson`. The test environment routes remote mail to a blackhole, so the probe cannot see DKIM. *Default:* no plan change. After deploy, send to an external mailbox and confirm `dkim=pass`. If it fails, add an `{"@type":"update","object":"SieveUserInterpreter",…}` line to `plan/30-mta.ndjson`.
2. **HTML replies.** *Default:* no (text only).
3. **Recipient scope** (contacts-only etc.). *Default:* none; the server default (once per sender per `defaultExpiryVacation`) applies.

---

### M7. Undo send + scheduled send
**Effort** L · **Risk** high · **Touches** packages/calendar-core, packages/native-core, apps/web, apps/native-mail, apps/stalwart

**Why.** Users expect a short undo window and send-later. Both map onto one server mechanism, RFC 4865 FUTURERELEASE holds on the JMAP submission plus `undoStatus: "canceled"`. The hold survives a closed tab or a killed app. The work is reconciling holds with the existing send invariants and with plaintext waiting for external recipients.

**Current state.**
- **The send builder** is `packages/calendar-core/src/mail-jmap-email-set.ts:189-282` `buildSendMessageMethodCalls`.
  - Envelope `mailFrom.parameters` carries only `ENVID` (`:234`).
  - **External send:** a plaintext `draft1` is submitted with `onSuccessDestroyEmail: ["#s1"]` (`:241-243`; comment: "Stalwart queues its own copy of the bytes"). A sealed copy `SENT_COPY_CREATION_ID = "sent1"` is created in Sent in the same request (`:42`, `:244-251`).
  - **Internal send:** `onSuccessUpdateEmail` moves the encrypted `draft1` into Sent (`:252-260`).
  - **Encrypted attachments** use `Email/import` (`:264-277`).
- **Send execution** is `performSend` (`:782-925`).
  - Its receipt `emailId` is the stored sealed copy (`created.sent1 ?? created.draft1`, `:916-921`).
  - `finishAcceptedSend` destroys `previousDraftId` after acceptance (`:775-780`).
  - `reconcileSubmission` (`:695-724`) already runs `EmailSubmission/query` + `/get` and accepts `undoStatus` `pending|final` by `ENVID`.
- **No hold support today.** `MailServerPolicy` (`packages/calendar-core/src/mail-server-policy.ts:100-113`, `resolveMailServerPolicy` `:229`) never reads the `urn:ietf:params:jmap:submission` capability.
- **Stalwart.**
  - The `x:MtaExtensions.futureRelease` default is `{"else":"false","match":{"0":{"if":"!is_empty(authenticated_as)","then":"7d"}}}` (`apps/stalwart/stalwart/cli-schema.json`). It is not set in `apps/stalwart/stalwart/plan/30-mta.ndjson`.
  - Queued messages are `x:QueuedMessage` with a `blobId` "stored message content". That is the MTA queue, separate from at-rest-encrypted mailbox storage (`plan/17-encryption.ndjson`).
  - `maxDelayedSend` and `undoStatus` are protocol properties, not config, so they are absent from the schema. They must be verified at runtime (probe).
- **Callers.**
  - Web compose: `apps/web/hooks/use-mail-app.ts:1615` `handleSendMessage` → `client.sendMessage` `:1887`.
  - Web quick reply: `:2363`.
  - Native: `apps/native-mail/src/hooks/use-compose-send.ts:79` `sendNow` → `useSendMessage` (`apps/native-mail/src/lib/mail/use-mail.ts:855-929`; input type at `:703`).
  - The send button is at `apps/web/components/mail/compose-dialog.tsx:718-725` (web) and `apps/native-mail/src/components/mail/ComposeHeader.tsx:41-51` (native).
- **Undo toast precedents.**
  - Web uses the `@workspace/ui/lib/toast` action (`use-mail-app.ts:2043-2073`). The helper keeps action toasts open until dismissed for WCAG 2.2.1 (`packages/ui/src/lib/toast.ts:7-13`).
  - Native uses `useMailUndoToast` (`apps/native-mail/src/hooks/use-mail-undo-toast.ts`).
- **Draft editors restore text only.** Web `handleEditDraft` seeds text/html (`use-mail-app.ts:2150-2209`). Native: "drafts don't store attachments" (`apps/native-mail/src/hooks/use-compose-leave.ts:115`).
- **Native offline store** keeps first-page lists, threads, labels and bodies only (`apps/native-mail/src/lib/mail/mail-offline-store.ts`; AGENTS §2). No new store is allowed.

**Design.**
1. **Holds.**
   - Undo window: `HOLDFOR=<seconds>`. It is relative, so client clock skew can't shorten it.
   - Scheduled send: `HOLDUNTIL=<YYYY-MM-DDTHH:MM:SSZ>`.
   - Both go in `envelope.mailFrom.parameters` beside `ENVID`.
   - Both are gated by `policy.maxDelayedSendSeconds`, read from `session.capabilities["urn:ietf:params:jmap:submission"].maxDelayedSend` (0 when missing). With 0, the schedule control is hidden, the undo window is skipped, and sends go out immediately as today.
2. **Invariants are kept, not relaxed.**
   - Queue acceptance is still "sent" for the attempt model, and the replaced draft is still destroyed then.
   - The recoverable artifact is the sealed copy (`receipt.emailId`). For external sends that is `sent1`; for internal sends it is `draft1`, which is sealed to recipients **and the sender**. External plaintext is still destroyed at submission creation via `onSuccessDestroyEmail`, since RFC 8621 runs it at creation, not at delivery.
3. **Cancel** = `EmailSubmission/set { update: { [submissionId]: { undoStatus: "canceled" } } }`.
   - On `updated`, run `Email/set { update: { [copyEmailId]: { mailboxIds: { [draftsMailboxId]: true }, keywords: { $draft: true, $seen: true } } } }`. The sealed copy becomes a sealed draft, and replacing `keywords` drops the schedule keyword.
   - `notUpdated[id].type === "cannotUnsend"` → result `"sent"` ("Too late to undo. The message was sent.").
   - The two calls are sequential: never move the copy unless the cancel was confirmed.
4. **Undo UX.**
   - After a held send, compose closes and the toast shows "Sending…" with **Undo**.
   - Web reuses one sonner toast id. When `forSeconds` elapse it updates to "Message sent." without the action; until then the helper keeps it open.
   - Native: `toast(message, "success", { duration: forSeconds * 1000, action })`.
   - Undo → cancel → move the copy to Drafts → reopen compose from an **in-memory snapshot** of the form taken just before send, including attachments, with `draftId = copyEmailId`. The next autosave replaces the copy (`buildDraftMethodCalls` destroys `previousDraftId`). Closing immediately still leaves the sealed draft.
5. **Scheduled-send link.**
   - The sealed copy of a scheduled send gets keyword `$solace-scheduled-<ENVID>` (32 hex, `scheduledSendKeyword(token)`). This lets a pending submission be joined to its copy even when its own `emailId` was destroyed (external send).
   - Undo-window holds get no keyword, so they never appear in the Scheduled list.
   - The keyword reveals nothing new, since `ENVID` is already on the server submission.
6. **Scheduled list.**
   - Request 1: `EmailSubmission/query { filter: { undoStatus: "pending" }, limit: 100 }` + `EmailSubmission/get` via back-reference `#ids`, with properties `["id","sendAt","undoStatus","envelope"]`.
   - Request 2: `Email/query { filter: { operator: "OR", conditions: [{ hasKeyword }] } }` + `Email/get` (`["id","subject","to","cc","bcc","threadId","mailboxIds","hasAttachment"]`).
   - Join to `ScheduledMailSend { submissionId, emailId, sendAt, subject, recipients, hasAttachment }`. Sort by `sendAt` client-side (`[...xs].sort`).
7. **Caps.**
   - Earliest: now + 2 min.
   - Latest: `now + min(maxDelayedSendSeconds, 7 d)` when all recipients are internal (sealed), and **`now + 24 h` when any recipient is external**, because that plaintext waits readable in Stalwart's queue for the whole hold.
   - The picker shows the disclosure "People outside Solace get this message unencrypted, and it waits readable on the mail server until it's sent." whenever external recipients are present.
   - Defence in depth: `performSend` refuses a `hold.until` beyond 24 h when `sentCopyCiphertext !== null` (the external-plaintext signal).
8. **Setting.** `MailComposeSettings.undoSendSeconds ∈ {0,5,10,20,30}`, default `5`.
9. **Picker.**
   - `getScheduledSendPresets(now, timezone)` returns:
     - "Tomorrow morning", tomorrow 08:00.
     - "Tomorrow afternoon", tomorrow 13:00.
     - "Monday morning", next Monday 08:00, omitted when it equals tomorrow.
     - Each built with `utcToPickerDate` + calendar-day arithmetic + `wallClockToUtc(day, h, m, tz)`, then filtered by the cap.
   - Custom = day `YYYY-MM-DD` + time `HH:MM` → `parseCalendarDayKey` + `wallClockToUtc`.
   - Web uses `<input type="date">`/`<input type="time">`. Native uses two `SheetTextField`s, matching `MailFilterSheet`'s date-field precedent. No new picker dependency.
10. **Sent rows** of pending scheduled copies show "Scheduled · <time>" (user tz and time format) instead of the time.
11. **Scope.** Holds apply only to the main compose send (web compose, native compose). Web quick reply and SimpleLogin actions send immediately as today.
12. **Push and offline.**
    - No push change: internal recipients get the normal webhook push at real delivery, and bounces arrive as ordinary mail.
    - The Scheduled list and pending map live only in TanStack memory, never in the native offline snapshot.
    - The copy moved back to Drafts reaches other devices through the existing `Email/changes` sync.

**Changes.**
- **packages/calendar-core**
  - `src/mail-jmap-email-set.ts`
    - Add to `OutgoingJmapMessage`: `hold?: { forSeconds: number } | { until: string }`.
    - In `buildSendMessageMethodCalls`:
      - Validate `forSeconds` (integer 1…2 592 000) and `until` (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/`), otherwise throw "Invalid send time.".
      - Add `HOLDFOR: String(forSeconds)` / `HOLDUNTIL: until` to `mailFrom.parameters`.
      - When `until` is set, require `submissionToken` and add `scheduledSendKeyword(submissionToken): true` to the sealed copy's `keywords` (`sent1` for external; `draft1` in both the `Email/set` and `Email/import` branches for internal).
    - In `performSend`: call `assertMailSendHold(message, Date.now())` before building.
    - New exports:
      - `cancelHeldJmapSubmission({ submissionId, copyEmailId, draftsMailboxId, mailAccountId, submissionAccountId, request }): Promise<"canceled" | "sent">`.
      - `listScheduledJmapSends({ mailAccountId, submissionAccountId, request }): Promise<ScheduledMailSend[]>`.
      - Both Zod-parse every result.
  - New `src/mail-scheduled-send.ts` (exported):
    - Constants: `SCHEDULED_SEND_KEYWORD_PREFIX = "$solace-scheduled-"`, `MIN_SCHEDULE_LEAD_MS = 120_000`, `MAX_SEALED_HOLD_MS = 7 * 86_400_000`, `MAX_EXTERNAL_HOLD_MS = 86_400_000`, `UNDO_SEND_SECONDS_OPTIONS = [0, 5, 10, 20, 30]` with labels ("Off", "5 seconds", …).
    - `scheduledSendKeyword(token)` and `scheduledSendLatest(now, policy, hasExternal)`.
    - `getScheduledSendPresets(now, timezone)`.
    - `parseScheduledSendInput(day, time, timezone)`.
    - `resolveMailSendHold({ sendAt?, undoSendSeconds, policy, hasExternalRecipients, now }) → { hold?: …; error?: string }`.
    - `assertMailSendHold`.
    - `SCHEDULED_SEND_EXTERNAL_NOTICE`.
  - `src/mail-server-policy.ts`: add `maxDelayedSendSeconds: number` to `MailServerPolicy`, read in `resolveMailServerPolicy` from the submission capability (non-negative integer, else 0).
  - `src/mail-compose-settings.ts`: add `undoSendSeconds` to the type, `DEFAULT_MAIL_COMPOSE_SETTINGS` (5) and `normalizeMailComposeSettings` (only values in `UNDO_SEND_SECONDS_OPTIONS`).
- **packages/native-core**
  - `src/lib/query-keys.ts`: `mailScheduledSends: () => ["mail", "scheduledSends"] as const`.
- **apps/web**
  - `lib/mail/jmap-client.ts`: `cancelHeldSubmission(session, { submissionId, copyEmailId })` and `listScheduledSends(session)`. Both are thin wrappers using `getSubmissionAccountId` (`:91-98`), drafts mailbox resolution and `using` incl. `urn:ietf:params:jmap:submission`.
  - `lib/mail/mail-query-keys.ts`: `scheduledSends: (userId: string | null) => [...mailQueryKeys.all, "scheduled-sends", userId] as const`.
  - `hooks/use-mail-app.ts`
    - `handleSendMessage(options?: { skipAttachmentCheck?: boolean; sendAt?: string })`.
    - Compute `hasExternal = !shouldEncryptOutgoingMail(allRecipients, internalDomain)` (`packages/calendar-core/src/mail-addresses.ts:255`) and pass `hold` from `resolveMailSendHold` into `client.sendMessage`.
    - Snapshot `bridge.getDraft()` before `resetDraft()` (`:1948`).
    - On a held success, show the undo toast (forSeconds) or "Scheduled for …" (until), then invalidate `scheduledSends`.
    - Undo handler: `cancelHeldSubmission` → `"canceled"` → new bridge method `restoreDraft(snapshot, draftId)`; `"sent"` → toast "Too late to undo. The message was sent.".
  - `components/mail/mail-compose-types.ts` / `mail-compose-provider.tsx`: add `restoreDraft(draft: ComposeDraft, draftId: string | null): void` to `MailComposeBridge`.
  - `components/mail/compose-dialog.tsx:718-725`: add a split chevron button (`aria-label="Schedule send"`, lucide `Clock`) opening a `Popover` (`@workspace/ui/components/ui/popover`) containing:
    - Presets.
    - Date + time inputs.
    - External disclosure.
    - A "Schedule" button calling `onSend({ sendAt })`.
    - Disabled when `composeMailPolicy.maxDelayedSendSeconds === 0`.
  - New `hooks/use-scheduled-mail-sends.ts`: query (staleTime 60 s) plus a cancel mutation that optimistically removes the row, rolls back on error and invalidates `scheduledSends` and the Sent/Drafts mailbox lists narrowly.
  - New `components/mail/scheduled-sends-panel.tsx`: `PaletteView title="Scheduled"`; rows show subject, recipients and time with a "Cancel and move to Drafts" button. Add `"scheduled"` to `MailPaletteView` and a branch in `mail-command-palette-view-content.tsx`.
  - `components/mail/mail-sidebar.tsx`: a "Scheduled (n)" row under Sent when n > 0, opening the palette at `"scheduled"` via `paletteInitialView`.
  - `components/mail/message-list.tsx`: "Scheduled · time" label for ids in the pending map.
  - `components/mail/compose-settings-panel.tsx`: `PaletteSelect` "Undo send" over `UNDO_SEND_SECONDS_OPTIONS`, with a hint when the server doesn't support delayed sending.
- **apps/native-mail**
  - `src/lib/mail/jmap-client.ts`: the same two wrappers.
  - `src/lib/mail/use-mail.ts`: `SendMessageInput` (`:703`) gains `hold`, forwarded to `client.sendMessage` (`:885-905`).
  - `src/hooks/use-compose-send.ts`
    - `handleSend(sendAt?: string)`.
    - Compute `hasExternal`; build the hold from `runtime.mailServerPolicy` and `settings.undoSendSeconds`.
    - Snapshot `form` before `onSent()`.
    - On a held success, show the undo toast. Undo → cancel → `openCompose({ mode: "restore", form: snapshot, draftId })`.
  - `src/lib/mail/compose-request.ts`: add `ComposeMode` `"restore"` with `form?: ComposeFormState; draftId?: string`. Handle it in compose seeding (`src/lib/mail/compose-seed.ts`) by dispatching the snapshot fields and attachments.
  - `src/components/mail/ComposeHeader.tsx`: a "clock" `Pressable` (`accessibilityLabel="Schedule send"`, 44 pt) next to Send.
  - New `src/components/mail/ComposeScheduleSheet.tsx` (`BottomSheet`):
    - Preset `SheetItem`s.
    - Day/time `SheetTextField`s.
    - Footer disclosure when external.
    - `SheetButton` "Schedule".
  - New `src/hooks/use-scheduled-mail-sends.ts`, mirroring web, with `QUERY_KEYS.mailScheduledSends()`.
  - New `src/components/mail/MailScheduledSheet.tsx` (`BottomSheet` list with a cancel action per row), opened from a "Scheduled (n)" row in `src/components/mail/MailboxDrawerSheet.tsx` (`MailboxList`, `:86-150`) via new list-controller state `scheduledOpen`.
  - `src/components/mail/MailMessageRow.tsx`: the Scheduled label.
  - `src/components/settings/sections/ComposeSettingsContent.tsx`: "Undo send" radio section (`SheetItem` `accessibilityRole="radio"`), plus entries in `src/lib/settings-search-entries.ts`.
- **apps/stalwart**
  - `stalwart/plan/30-mta.ndjson`: append `{"@type":"update","object":"MtaExtensions","value":{"futureRelease":{"else":"false","match":{"0":{"if":"!is_empty(authenticated_as)","then":"7d"}}}}}`. This pins today's default so an upstream default change can't silently change the client cap.

**Compatibility.**
- Shipped binaries send immediately and never cancel. They show held copies in Sent like any sent mail; the unknown keyword is ignored, and label chips read only `label:*` keywords.
- An older binary that saves mail settings drops `undoSendSeconds`, because `sanitizeMailSyncedSettings` keeps known keys only. New clients then fall back to the default 5. This is accepted, since the default is safe.
- `reconcileSubmission` already accepts `pending`, so a retried held send reconciles.

**Tests.**
- `packages/calendar-core/src/__tests__/mail-jmap-email-set.test.ts`:
  - `HOLDFOR` / `HOLDUNTIL` are added beside `ENVID`.
  - The keyword is set on `sent1`, on `draft1` and on the import branch for `until`, and on nothing for `forSeconds`.
  - Malformed holds throw.
- `packages/calendar-core/src/__tests__/mail-jmap-send.test.ts`:
  - An external hold > 24 h is refused before any request.
  - The receipt is unchanged.
  - `cancelHeldJmapSubmission` covers `updated`, `cannotUnsend`, and "the move is not attempted when the cancel fails".
  - `listScheduledJmapSends` joins by keyword, and drops pending submissions without a keyed copy.
- `packages/calendar-core/src/__tests__/mail-scheduled-send.test.ts` (new): presets in `Europe/Amsterdam` around DST, caps (internal 7 d, external 24 h, server max), `resolveMailSendHold` with `maxDelayedSendSeconds` 0.
- `packages/calendar-core/src/__tests__/mail-server-policy.test.ts`: `maxDelayedSendSeconds`.
- `packages/calendar-core/src/__tests__/mail-compose-settings.test.ts`: `undoSendSeconds` normalization.
- `apps/web/__tests__/lib/mail-jmap.test.ts` and `apps/native-mail/src/lib/mail/jmap-client.test.ts`: wrapper request shapes.
- `apps/native-mail/src/hooks/use-compose-send.test.tsx`: hold passed, undo restores the form with attachments, "Too late" path.
- `apps/web/__tests__/hooks/use-scheduled-mail-sends.test.tsx` (new): optimistic removal and rollback.
- Both `react-compiler.test.ts` files: no new skips.
- **Stalwart probe, new `apps/stalwart/tests/probe_jmap_send_features.py --assert`.** Reuse `target()`/`wait_until()` by importing `probe_subject_search` (same directory). With two local users on the disposable target it asserts:
  - (a) The session advertises `urn:ietf:params:jmap:vacationresponse` and `urn:ietf:params:jmap:submission.maxDelayedSend > 0`.
  - (b) `VacationResponse/set` then `/get` round-trips.
  - (c) A submission with `HOLDFOR=600` returns `undoStatus:"pending"` and `sendAt ≈ now+600 s`.
  - (d) `EmailSubmission/query {undoStatus:"pending"}` finds it.
  - (e) Setting `undoStatus:"canceled"` lands in `updated`, and the recipient's Inbox never receives it.
  - (f) `HOLDUNTIL` beyond `maxDelayedSend` lands in `notCreated`.
  - (g) A held external (blackhole) submission with `onSuccessDestroyEmail` destroys the email while the submission stays pending.
- **CI.** Add a step after `.github/workflows/pr-tests.yml:128`: `python3 -B apps/stalwart/tests/probe_jmap_send_features.py --assert`.

**Docs.** Root `AGENTS.md` §8 has two edits.
- Change "Once the submission is queued the send has succeeded (a missing Sent copy or failed cleanup is only logged), the draft it replaces is destroyed only then, and a refused send removes what it created." Append:
  - " A held submission (undo window `HOLDFOR`, scheduled `HOLDUNTIL`, `mail-scheduled-send.ts`) counts as queued; canceling it (`undoStatus: "canceled"`) moves its sealed copy back to Drafts, and a scheduled copy carries `$solace-scheduled-<ENVID>` so the Scheduled list can find it."
- After "Attachments reach the server in plaintext only for such an external send, uploaded at send time; …" add:
  - " A scheduled send to external recipients waits readable in Stalwart's queue until release, so its hold is capped at 24 hours and the picker says so."

**Decisions.**
1. **Default undo window.** *Default:* 5 s, which matches common clients. With `maxDelayedSend` 0 it silently falls back to immediate.
2. **External hold cap.** *Default:* 24 h with disclosure. The alternative, refusing scheduled external sends, is stricter but blocks a common use.
3. **"Send now" on a scheduled item.** *Default:* not offered (it needs cancel + resubmit); cancel-to-Drafts covers editing.
4. **Attachments after a scheduled cancel.** They stay inside the sealed draft copy, but the existing draft editors don't restore them. *Default:* when `hasAttachment`, the cancel toast says "Moved to Drafts. Attachments aren't kept when you edit it." Restoring attachments in drafts is a separate follow-up.
5. **Undo for quick reply.** *Default:* no, compose only.
6. **The "Scheduled" label in Sent.** *Default:* yes; without it a scheduled message looks already sent.

---

### M8. Auto-advance after archive/delete/move in the reader
**Effort** S · **Risk** low · **Touches** packages/calendar-core, apps/web, apps/native-mail

**Why.** Triage is faster when the reader moves to the next message instead of jumping somewhere arbitrary. Today web jumps to the *top* of the list, and native always pops back to the list.

**Current state.**
- **Web.** After a single delete or move, selection becomes `remaining[0]` (the first row). After bulk delete or move it is the same (`apps/web/hooks/use-mail-app.ts:2014,2037,2573` and `:2857,2892`).
  - The visible order is `filteredListMessages` (`apps/web/components/mail/use-mail-app-content-controller.tsx:242-246`), with j/k navigation over it at `:354-366`.
  - Archive is `handleMoveMessage(archive.id)` (`:398-408`). The keyboard `e`/`#` wiring is at `:412-432`.
  - List-row actions call the same handlers (`apps/web/components/mail/mail-app/mail-app-list-column.tsx:224-233`).
  - `handleUntrash`, `handleReportSpam` and `handleNotSpam` delegate to `handleMoveMessage` (`use-mail-app.ts:2629-2658`).
- **Native.** The reader is the deep-linkable route `app/mail/message/[id].tsx`. After trash, delete or move, `useMailMessageActions` calls `back()` (`apps/native-mail/src/hooks/use-mail-message-actions.ts:48,257,284`). The reader doesn't know the list order.
  - Rows open via `router.push(mailMessageRoute(id))` in `useMailRowHandlers.handleOpenMessage` (`apps/native-mail/src/hooks/use-mail-row-handlers.ts:39-46`).
  - The ordered rows are `list.threadRows` in `useMailListController` (`apps/native-mail/src/hooks/use-mail-list-controller.ts:78-88,128-135`).
  - `MailSelectionProvider` (`apps/native-mail/src/providers/MailSelectionProvider.tsx:11-40`) is mounted above both list and reader (`apps/native-mail/app/_layout.tsx:51-86`).

**Design.**
- **Setting:** `MailListSettings.autoAdvance: "next" | "previous" | "list"`, default `"next"`. Options `MAIL_AUTO_ADVANCE_OPTIONS`: "Open the next message", "Open the previous message", "Return to the list".
- **Pure rule:** `resolveMailAutoAdvanceTarget(orderedIds, removedIds, currentId, mode): string | null`.
  - "next" walks down from `currentId`'s index, "previous" walks up. Each skips removed ids, with no wrap and no fallback to the other direction.
  - `currentId` not in `orderedIds` → `null`; `"list"` → `null`.
- **Web.** Auto-advance applies only when the removed message is the open one; the existing `cur === targetId` guards stay.
  - Replace each `remaining[0]?.id ?? null` with `options?.advanceTo ?? null`.
  - The controller computes `advanceTo` from `filteredListMessages`.
  - `null` closes the reader, which on mobile web returns to the list.
- **Native.**
  - When a row is opened, the event handler stores the visible order in `MailSelectionProvider` (`readerOrder: string[]`).
  - After a successful remove in the reader, the target is resolved from `readerOrder`. The provider's order is updated without the removed id, then `replace(mailMessageRoute(next))`, or `back()` when there is no target.
  - Opening from push or a deep link leaves `readerOrder` empty, which resolves to `back()`, today's behaviour.

**Changes.**
- **packages/calendar-core**
  - `src/mail-list-settings.ts`:
    - `export type MailAutoAdvance = "next" | "previous" | "list"`.
    - Add the field to `MailListSettings`, `DEFAULT_MAIL_LIST_SETTINGS` (`"next"`) and `normalizeMailListSettings`.
    - Add `MAIL_AUTO_ADVANCE_OPTIONS` and `resolveMailAutoAdvanceTarget`.
- **apps/web**
  - `hooks/use-mail-app.ts`: add a trailing optional `options?: { advanceTo?: string | null }` to `handleDeleteMessage`, `handleMoveMessage`, `handleUntrash`, `handleReportSpam`, `handleNotSpam`, `handleBulkDelete` and `handleBulkMove`. Forward it in the delegating ones and use it at the five `remaining[0]` sites.
  - `components/mail/use-mail-app-content-controller.tsx`:
    - Add `const advanceAfter = (removed: string[]) => resolveMailAutoAdvanceTarget(filteredListMessages.map((m) => m.id), removed, selectedMessageId ?? "", listSettings.autoAdvance)`.
    - Wrap the seven handlers so they pass `{ advanceTo: advanceAfter([...]) }`.
    - Return the wrapped versions (`:679-680` and the bulk ones) so list rows, the reader toolbar and shortcuts all get them.
  - `components/mail/mail-list-settings-panel.tsx`: a `PaletteSelect` "After archiving or deleting", in the "Reading" section.
  - Update `apps/web/__tests__/components/mail-destructive-flows.test.tsx` expectations that assumed first-row selection.
- **apps/native-mail**
  - `src/providers/MailSelectionProvider.tsx`: add `readerOrder: string[]` and `setReaderOrder` (`useState`).
  - `src/hooks/use-mail-row-handlers.ts`:
    - Accept `orderedMessageIds: string[]` and keep it in a latest-value ref updated in an effect (pattern: `apps/web/hooks/use-mail-keyboard-shortcuts.ts:70-73`). This keeps `handlers` identity stable, so memoized rows (`apps/native-mail/src/components/mail/MailThreadListRow.tsx:102-121`) don't re-render.
    - In `handleOpenMessage`, call `setReaderOrder(ref.current)` before `push`.
  - `src/hooks/use-mail-list-controller.ts`: pass `list.threadRows.map((row) => row.latestMessage.id)`.
  - `src/hooks/use-mail-message-actions.ts`: replace both `back()` calls with `leaveAfterRemoval(messageId)`. It uses `useMailSelection()`, `listSettings.autoAdvance`, and `replace` from `useRouter`.
  - `src/components/settings/sections/MailListSettingsContent.tsx`: an "After archiving or deleting" radio section, plus entries in `src/lib/settings-search-entries.ts`.

**Compatibility.** The new field defaults when missing. Older binaries that save drop it, and it falls back to the default. No server impact.

**Tests.**
- `packages/calendar-core/src/__tests__/mail-list-settings.test.ts`: normalize, plus resolver cases: last row next → `null`, skip removed ids, bulk removal, current not listed.
- `apps/web/__tests__/components/mail-destructive-flows.test.tsx`: archive and delete open the next row, `"list"` closes the reader, and acting on a non-open row keeps the selection.
- `apps/native-mail/src/hooks/use-mail-message-actions.test.tsx`: `replace` to the next id, and `back()` with an empty order or `"list"`.

**Docs.** None.

**Decisions.**
1. **Default mode.** *Default:* `"next"`. It keeps web's reader open, close to today's shape, and fixes the jump-to-top. `"list"` would match native's current behaviour.
2. **Thread-internal messages on native** (opened through the thread stack, not a row id). *Default:* return to the list.

---

### M9. Typed mail search operators
**Effort** L · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-mail

**Why.** Power users type `from:alice has:attachment -is:read`. Today filters come only from panel controls, and typed `from:x` is sent as plain text. With the on-device index off, that text even goes to the server's full-text search.

**Current state.**
- **Model.** `MailSearchFilterCondition { from, to, subject, body, hasAttachment, before, after, isFlagged, isUnread }` (`packages/calendar-core/src/mail-search-filter.ts:4-14`).
  - Chips already print operator syntax: `from:`, `has:attachment`, `is:starred`, `is:unread` (`conditionToChip` `:104-138`, `filtersToChips` `:140-149`).
  - `buildJmapFilter` (`:173-210`) ANDs single-field fragments; dates go through `toJmapUtcDate` in the user's time zone (`:69-100`).
- **On-device path.** `searchIndexedMailbox` (`packages/calendar-core/src/mail-local-search.ts:40-66`) checks from/to/subject/body/dates on index documents. `matchesMessageConditions` (`:69-79`) checks attachment and keywords on rows fetched by id.
  - Index documents have no cc, size, keywords or attachment names (`packages/calendar-core/src/title-search-index.ts:30-46`).
- **Web.** The inline search box has its text in `mailListSearch`, and panel chips are in `advancedFilters` (`apps/web/components/mail/use-mail-app-content-controller.tsx:150-215`). Enter only flushes the debounce (`:544-573`).
  - `searchMailbox` takes the local branch while the index is on (`apps/web/lib/mail/mailbox-search.ts:29-60`; its `filtersMessages` widens the index limit at `:35-43`) and builds a JMAP filter otherwise.
  - Loaded messages are merged by raw text (`mergeInlineSearchResults`, `use-mail-app-content-controller.tsx:228-240`).
  - Chips render in `apps/web/components/mail/advanced-search-panel.tsx` (`removeConditionField` `:35-48`).
- **Native.** Free-text search is the command palette (`apps/native-mail/src/components/CommandPalette.tsx:73-86`). It runs a server text search via `usePaletteMailSearch` (`apps/native-mail/src/components/command-palette/use-palette-mail-search.ts:5-24`), or the title index while it is on.
  - Structured search is `MailFilterSheet` fields and list toggles (`apps/native-mail/src/hooks/use-mail-list-search.ts`, `apps/native-mail/src/lib/search/local-mail-search.ts:19-62`).
- **Fetched-row properties.**
  - Web list/by-id rows lack `cc` (`EMAIL_LIST_GET_PROPERTIES`, `apps/web/lib/mail/jmap-client.ts:216-231`) but include `size`.
  - Native `row` view includes `cc` but not `size` (`apps/native-mail/src/lib/mail/jmap-client.ts:176-207`), and native `JmapEmailMessage` has no `size` (`apps/native-mail/src/lib/mail/types.ts:93-113`).
- **Folder names** are decrypted on the device (`openMailboxNames`, web `jmap-client.ts:674-694`). Label names come from `LabelDef { id, name, color }` (`apps/web/lib/mail/types.ts:321`, `apps/native-mail/src/lib/mail/types.ts:132`).
- **Tokenizer.** The shared `packages/calendar-core/src/search-query.ts` does not exist yet (planned by the calendar item).

**Design.**
- **Tokenizer contract (dependency).**
  - Mail calls `tokenizeSearchQuery(input, MAIL_SEARCH_OPERATOR_KEYS)`.
  - The calendar item must accept an optional `knownKeys: ReadonlySet<string>`. Without it the tokenizer cannot leave "unknown keys as plain terms" for mail's keys.
  - Keys compare lowercase.
  - Mail turns any operator whose key it doesn't know back into a term, and treats a term `-word` (length > 1) as a negated word if the tokenizer leaves it in `terms`.
- **Operator keys:** `from, to, cc, subject, has, is, in, label, before, after, larger, smaller, filename`.
- **Mapping.** Each operator becomes one condition, so negation is per condition. New condition fields:
  - `cc?: string`
  - `text?: string` (negated bare words only)
  - `isRead?: boolean`
  - `inMailbox?: { id: string; name: string }`
  - `label?: { id: string; name: string }`
  - `minSize?: number`, `maxSize?: number`
  - `negated?: boolean`

  | Operator | Condition | JMAP fragment | Local stage |
  |---|---|---|---|
  | `from:` `to:` `subject:` `before:` `after:` | existing | existing | index |
  | `-word` | `{ text, negated }` | `text: toJmapTextQuery(word)` | index (title/from/to/body) |
  | `cc:` | `cc` | `cc` | row (`message.cc`) |
  | `has:attachment` | `hasAttachment` | `hasAttachment: true` | row |
  | `is:unread` / `is:read` / `is:starred` | `isUnread` / `isRead` / `isFlagged` | `notKeyword`/`hasKeyword: "$seen"` / `hasKeyword: "$flagged"` | row |
  | `label:` | `label` | `hasKeyword: "label:<id>"` | row (keywords) |
  | `larger:` / `smaller:` | `minSize` / `maxSize` | `minSize` / `maxSize` | row (`message.size`) |
  | `in:` | `inMailbox` | **scope**: replaces the `inMailbox` base | scope |
  | `-in:` | `inMailbox` + negated | `NOT { inMailbox }` | row (`mailboxIds`) |
  | `filename:` | — | — | — (issue) |

- **Negation.** A negated condition is wrapped as `{ operator: "NOT", conditions: [fragment] }` in `buildJmapFilter`. Locally it is inverted only in the stage that owns its field. A stage skips conditions with none of its fields, so the skip is never inverted.
  - Index fields: `from, to, subject, body, text, before, after`. Row fields: the rest.
- **Scope.** `resolveMailSearchScope(currentMailboxId, filters)` = the first non-negated `inMailbox.id`, else the current mailbox. Every search path uses it, both `buildJmapFilter`'s base and the local `mailboxId`.
- **Name resolution** happens on the device, never on the server.
  - `in:` matches role names (`inbox`, `sent`, `drafts`, `trash`, `spam`/`junk`, `archive`) and opened display names, case-insensitive.
  - `label:` matches `LabelDef.name` the same way.
  - Sizes accept `500K`, `10M`, `1G`, `2MB` and plain bytes: append `b` to a trailing k/m/g and reuse `parseStalwartSizeBytes` (`packages/calendar-core/src/mail-server-limits.ts:58-82`).
  - Dates use the existing `isValidSearchDate`/`toJmapUtcDate` (`YYYY-MM-DD`, user tz).
- **Issues.**
  - Unresolvable or invalid operators are dropped from the query, so they are never sent as text, and reported as `issues: string[]`. Messages: `No folder named “X”.`, `No label named “X”.`, `Use dates like 2026-11-14.`, `Use sizes like 500K or 10M.`, `Searching attachment names isn't available yet.`.
  - Issues show inline under the field: web uses a `role="status"` line, native the palette section footer.
- **`filename:`.** RFC 8621 has no attachment-name filter, encrypted mail hides names inside ciphertext, and the on-device index has no names. It is therefore recognized (never leaks as text) but deferred (Decision 1).
- **Chips stay in sync, one source of truth per surface.**
  - Web: while typing, the debounced text is parsed during render and merged with `advancedFilters` for the search. On Enter, recognized operators are lifted into `advancedFilters` as chips and removed from the box (`liftMailSearchOperators`). Chips are then removed with the existing panel code.
  - Native palette: chips are derived from the text. Each recognized operator renders as a removable row, and removing it rewrites the text via `formatMailSearchQuery`.
- **Index-on rule kept.** With the index on, every operator query runs over the index and rows fetched by id. With the index off, it runs as a JMAP filter. With operators present, web skips `mergeInlineSearchResults`, because loaded rows don't honour the conditions.

**Changes.**
- **packages/calendar-core**
  - New `src/mail-search-operators.ts` (exported):
    - `MAIL_SEARCH_OPERATOR_KEYS`.
    - `parseMailSearchQuery(input, ctx: { mailboxes: Array<{ id; name; role? }>; labels: Array<{ id; name }> }): { text: string; filters: MailSearchFilters; issues: string[] }`.
    - `liftMailSearchOperators(input, current: MailSearchFilters, ctx)`, which returns the remaining text plus merged filters, deduped.
    - `mergeMailSearchFilters(a, b)`.
    - `formatMailSearchQuery(text, conditions)`.
    - `resolveMailSearchScope`.
  - `src/mail-search-filter.ts`:
    - Extend `MailSearchFilterCondition` and `MailSearchChip.value` (`string | boolean | number | { id; name }`).
    - `conditionToChip`: labels `cc:`, `is:read`, `in:<name>`, `label:<name>`, `larger:`/`smaller:` (via `formatAttachmentByteLimit`, `mail-server-limits.ts:181`), `-` prefix.
    - `conditionToJmapFragment`: the new fields plus NOT wrapping.
    - `buildJmapFilter`: scope.
  - `src/mail-local-search.ts`:
    - Stage-aware negation in `matchesIndexedCondition` and `matchesMessageConditions`. Widen the message type to `{ keywords; hasAttachment; cc; size; mailboxIds }`.
    - New `hasRowStageConditions(conditions)`, replacing web's inline `filtersMessages`.
    - Extract the local search body into `searchIndexedMailboxMessages({ documents, mailboxId, text, conditions, timezone, limit, getMessagesByIds })`, shared by both apps.
  - `src/search-query.ts` is owned by the calendar item. Only the `knownKeys` parameter is required (dependency).
- **apps/web**
  - `components/mail/use-mail-app-content-controller.tsx`:
    - Parse `trimmedDebouncedMailListSearch` with `{ mailboxes: activeMailbox.mailboxes, labels }`.
    - Pass `text: parsed.text`, `filters: mergeMailSearchFilters(advancedFilters, parsed.filters)` to `useMailboxSearch`.
    - Skip `mergeInlineSearchResults` when conditions exist.
    - `handleSearchEnter` → `liftMailSearchOperators`, then `patchListChrome({ mailListSearch: rest, advancedFilters })`.
    - Expose `searchIssues`.
  - `lib/mail/mailbox-search.ts`: use `resolveMailSearchScope`, `hasRowStageConditions` and `searchIndexedMailboxMessages`.
  - `lib/mail/jmap-client.ts:216`: add `"cc"` to `EMAIL_LIST_GET_PROPERTIES`.
  - `components/mail/mail-app/mail-app-list-column.tsx`: render `searchIssues`.
  - `components/mail/advanced-search-panel.tsx`: compare chip values by `id` for object values in `removeConditionField`.
- **apps/native-mail**
  - `src/components/command-palette/use-palette-mail-search.ts`: accept the parsed query.
    - With conditions or scope, run `searchIndexedMailboxMessages` (index on: snapshot via `readNativeTitleIndexSnapshot`, as `local-mail-search.ts:26-34`) or `client.searchMailboxMessagesWithFilter(buildJmapFilter(scope, filters, { timezone }))` (index off).
    - Otherwise run today's text search. The key stays `QUERY_KEYS.paletteMailSearch(scope, query)`.
  - `src/components/CommandPalette.tsx`:
    - Parse with `runtime.mailboxes` and `useLabels`.
    - Enable the hook when operators exist, even if `searchesLocally`.
    - Render a "Filters" `SheetSection` of `SheetItem`s (label = chip label, `accessibilityHint="Removes this filter"`) that rewrite `query`; issues go in the footer.
  - `src/lib/search/local-mail-search.ts`: delegate to `searchIndexedMailboxMessages`.
  - `src/lib/mail/jmap-client.ts:176-195`: add `"size"` to `EMAIL_GET_PROPERTIES`.
  - `src/lib/mail/types.ts`: add `size?: number` to `JmapEmailMessage`.

**Compatibility.** Pure client change. Old binaries keep sending typed text as plain text. No index format change.

**Tests.**
- `packages/calendar-core/src/__tests__/mail-search-operators.test.ts` (new):
  - Every key, quoted values, mixed case, negation, unknown keys left as text.
  - Folder resolution by role and by decrypted name; label resolution.
  - Size units, bad dates → issues, `filename:` → issue and not text.
  - Lift + format round trip.
- `packages/calendar-core/src/__tests__/mail-search-filter.test.ts`: NOT wrapping, scope replacement, new fragments and chip labels.
- `packages/calendar-core/src/__tests__/mail-local-search.test.ts`: negation in each stage, with no inversion of skipped stages; cc, size and label row checks.
- `apps/web/__tests__/lib/mailbox-search.test.ts`: index-on never calls the server filter, and scope is used.
- `apps/web/__tests__/components/mail-app-list-chrome-state.test.ts` (or `mail-app.test.tsx`): Enter lifts operators into chips.
- `apps/native-mail/src/lib/search/local-mail-search.test.ts`.
- New `apps/native-mail/src/components/command-palette/use-palette-mail-search.test.tsx`.

**Docs.** In root `AGENTS.md` §2, after "While that index is on, mailbox search runs only over it (`mail-local-search.ts`, empty while it builds) and fetches hits by id, so search words never reach the mail server.", add: " Typed operators (`mail-search-operators.ts`) resolve folder and label names on the device and follow the same rule."

**Decisions.**
1. **`filename:`.** *Default:* recognized and reported as not yet available. Follow-up: capped attachment names in the body index (`MailBodyLoader` would return names, `packages/calendar-core/src/mail-body-index.ts:85-88`).
2. **Web command palette operators.** *Default:* no; operators work in the inline list search (web's mailbox search). Native's palette is its mailbox search.
3. **Tokenizer `knownKeys`.** *Default:* the calendar item adds it. If it doesn't, mail keeps a local `key:value` split until it does (coordinate before merging).
4. **`cc:` and `larger:` with the index on** are row-stage checks over at most `LOCAL_MAIL_SEARCH_LIMIT` (200) index hits, the same ceiling as `is:`/`has:` today. *Default:* accept.

---

### M10. Configurable swipe actions (native-mail)
**Effort** M · **Risk** low · **Touches** packages/calendar-core, apps/native-mail (web: preference round-trip only)

**Why.** The fixed swipe actions (right = read, left = trash) suit few workflows; archive, star and move-to are common choices. **Single-platform by nature:** web mail has no swipe rows; the only swipe code on web is the calendar and palette (`packages/ui/src/hooks/use-horizontal-swipe-gesture.ts`, nothing under `apps/web/components/mail`). Web still round-trips the preference, because normalization is shared.

**Current state.**
- `apps/native-mail/src/components/mail/MailSwipeRow.tsx`:
  - The doc comment at `:32` reads "Swipe right to toggle read, swipe left to trash."
  - Thresholds `ACTION_THRESHOLD = 88`, `MAX_SWIPE = 140` (`:19-21`).
  - A Medium haptic fires on arming (`:44-48`).
  - Trash slides the row off (`-600`) and waits for the promise (`:83-90`).
  - Backgrounds are accent `primaryBase + "40"` and `destructive` (`:177-184`).
  - `accessibilityActions` are toggleRead/trash (`:116-119,149-156`).
- `MailThreadListRow.tsx:15-21` `MailThreadRowHandlers { onOpen, onToggleSelect, onToggleRead, onTrash? }` and `:62-75` swipe ids.
- `apps/native-mail/src/hooks/use-mail-row-handlers.ts:48-78` builds read and trash handlers; trash is disabled in Trash (`:77`).
- Mutations available: `bulkMoveToMailbox`, `bulkMarkAsRead`/`Unread`, `bulkMoveToTrash`, and `toggleFlagged` (`apps/native-mail/src/lib/mail/use-mail.ts:383-700`).
- The move sheet is `MailBulkMoveSheet` (`apps/native-mail/src/components/mail/MailBulkMoveSheet.tsx:24-30`), shown for `activeSheetView === "bulkMove"` (`apps/native-mail/app/mail/index.tsx:342-348`; `ListSheetView` at `use-mail-list-controller.ts:34`).

**Design.**
- **Setting:** `MailListSettings.swipeRight` and `swipeLeft`, each of type `MailSwipeAction = "none" | "read" | "archive" | "trash" | "star" | "move"`. Defaults are `"read"` and `"trash"`, so behaviour is unchanged.
- **`MAIL_SWIPE_ACTION_OPTIONS`:**

  | Value | Label | Feather icon |
  |---|---|---|
  | `"none"` | None | — |
  | `"read"` | Mark read or unread | `mail`/`check` |
  | `"archive"` | Archive | `archive` |
  | `"trash"` | Move to trash | `trash-2` |
  | `"star"` | Star or unstar | `star` |
  | `"move"` | Move to… | `folder` |

- **Availability per row.** An action is unavailable when there is no target: archive in the Archive folder or without an archive mailbox, trash in Trash. That direction then behaves as `"none"`.
- **Behaviour.**
  - Dismissing actions (archive, trash) slide the row off and await the mutation, as trash does today.
  - Non-dismissing actions (read, star, move) spring back. Move then opens `MailBulkMoveSheet` with the row's ids.
  - Star applies to the row's latest message, `flagged = latestMessage.keywords.$flagged`.
  - Haptics are unchanged (one Medium impact on arming).
  - Motion stays Reanimated transform-only, which honours Reduce Motion by default.
  - Colours are tokens only: trash uses `destructive`, every other action the accent wash. No new hues.
- **Accessibility.** `accessibilityActions` = the configured left and right actions, plus always "Mark as read/unread" and "Move to trash" when available, deduped. This keeps today's floor even when both swipes are `"none"`. Action labels come from the option table.

**Changes.**
- **packages/calendar-core**
  - `src/mail-list-settings.ts`: the type, both fields in `MailListSettings`, `DEFAULT_MAIL_LIST_SETTINGS`, `normalizeMailListSettings` (unknown values fall back per field), and `MAIL_SWIPE_ACTION_OPTIONS`.
- **apps/native-mail**
  - `src/components/mail/MailSwipeRow.tsx`:
    - Replace `read`/`onToggleRead`/`onTrash` props with `right?: MailSwipeSpec; left?: MailSwipeSpec`, where `MailSwipeSpec = { icon: FeatherIconName; label: string; destructive: boolean; dismisses: boolean; run: () => void | Promise<unknown> }`, plus `a11yActions: Array<{ name: string; label: string; run: () => void | Promise<unknown> }>`.
    - Gate the pan clamp per side on the presence of a spec.
    - Update the doc comment.
  - `src/components/mail/MailThreadListRow.tsx`: build the two specs from `settings.swipeRight/Left` and handlers. Pass `swipeRight`/`swipeLeft` as props so `sameRowProps` compares primitives.
  - `src/hooks/use-mail-row-handlers.ts`:
    - Add `onArchive?(ids)` (`bulkMoveToMailbox` to the archive id, `showMoveToast("Archived", snapshot)`).
    - Add `onToggleStar(id, flagged)` (`toggleFlagged.mutate`).
    - Add `onMove(ids)`.
    - Keep `mutate` references stable, as the existing comment at `:34` requires.
  - `src/hooks/use-mail-list-controller.ts`:
    - Add `"swipeMove"` to `ListSheetView` and `swipeMoveIds` state.
    - Add `handleSwipeMove(targetMailboxId)` → `bulkMoveToMailbox` + `showMoveToast`.
    - Pass `archiveMailboxId` and the swipe settings into rows.
  - `app/mail/index.tsx`: render `MailBulkMoveSheet` for `"swipeMove"`.
  - `src/components/settings/sections/MailListSettingsContent.tsx`: "Swipe right" and "Swipe left" radio sections (`SheetItem` `checked`, `accessibilityRole="radio"`) with the footer "Swipe a message in the list to run this action.".
  - `src/lib/settings-search-entries.ts`: entries for both.
- **apps/web**: no UI. The shared `normalizeMailListSettings` preserves both fields whenever web saves the blob.

**Compatibility.** Defaults reproduce today's behaviour. Older binaries that save drop the fields, which then fall back to the defaults. No server impact.

**Tests.**
- `packages/calendar-core/src/__tests__/mail-list-settings.test.ts`: defaults, invalid value fallback, round trip through `sanitizeMailSyncedSettings` (`mail-synced-settings.test.ts`).
- `apps/native-mail/src/components/mail/MailSwipeRow.test.tsx` (new):
  - The accessibility action list for each config, including both `"none"`.
  - `onAccessibilityAction` dispatch.
  - An unavailable action is not exposed.
- `apps/native-mail/src/__tests__/react-compiler.test.ts` passes.

**Docs.** None in AGENTS.md. The PR states the single-platform exception: touch gesture only, and web has no swipe rows.

**Decisions.**
1. **Star target on a thread row.** *Default:* the latest message only.
2. **Spam as a swipe action.** *Default:* not offered (move-to covers it).
3. **Full-swipe vs reveal-buttons.** *Default:* keep today's full-swipe threshold model.

---

## Calendar and web E2E (C1–C6, T2)

### C1. Export a whole calendar (or all calendars) as .ics on the device
**Effort** M · **Risk** med · **Touches** packages/calendar-ics, packages/calendar-core, packages/calendar-client, crates/solace-api-types + apps/backend (one query flag), apps/web, apps/native-calendar
**Why.** Today only one event at a time can leave Solace. A user who wants a backup or wants to move providers has no way out, and the server cannot build the file because it only holds ciphertext.
**Current state.**
- Single-event export only: `buildEventIcsExport` (`packages/calendar-core/src/event-ics-export.ts:48`), `toSafeIcsFilename` (`:22`), `toIcsRecurrenceRule` (`:32`). It writes UTC `DTSTART…Z` plus an `RRULE`, so weekly 09:00 Amsterdam events drift by an hour across DST in other clients. That is an existing bug, and the new builder fixes it for series.
- Multi-event builder already exists: `buildIcsCalendar({calendar, events})` (`packages/calendar-ics/src/index.ts:582`), `buildEventLines` (`:467`), `IcsBuildEventInput` (`:222`). It has no `EXDATE`, `RECURRENCE-ID`, `TZID` or `VTIMEZONE` support. The calendar-ics package cannot import calendar-core (calendar-core depends on it).
- Decrypted corpus: `loadEventSearchCorpus` (`packages/calendar-client/src/event-search-corpus.ts:11`) pages `GET /api/events/search-corpus`. The backend `search_corpus` (`apps/backend/src/events/listing.rs:312`) calls `Relations::load(…, false)` (`:343`), so **recurrence exceptions are not returned**. Only `/api/events` listing attaches them (`listing.rs:106`). DTO `RecurrenceException` is at `crates/solace-api-types/src/events.rs:158`; `exception_date` is the original occurrence start instant (`recurring/service.rs` `occurrence_date`). Override rows are `calendar_event` rows with `parent_event_id`. Split halves are child rows that have their own `recurrence`.
- Web single-event download: `downloadEventIcs` (`apps/web/components/event-editor/event-editor-invitation.ts:34`) uses an in-memory Blob.
- Native share: `shareEventIcs` (`apps/native-calendar/src/lib/event-ics-share.ts:11`) writes into `Paths.cache` root and deletes the file in `finally`. If the process is killed while the share sheet is open, the plaintext file stays there. Neither a launch wipe nor a sign-out wipe exists: native-calendar `_layout.tsx` passes no `lifecycle` to `AuthProvider` and no `prepareSession` to `NavigationGuard`. Mail does both (`apps/native-mail/src/lib/mail-session.ts:49,187`; `attachment-cache.ts` dedicated folder).
- `expo-sharing` and `expo-file-system` (new `File`/`Paths` API) are already dependencies, so nothing new is needed.
**Design.**
- **Range: all events only.** An export is a backup or migration, so a date window is YAGNI. Two entry points: one calendar, or "all calendars" as one combined file. expo-sharing shares a single file, and several browser downloads are hostile, so "all" is combined into one file.
- **Corpus with exceptions:** add an optional `includeExceptions` boolean to `GET /api/events/search-corpus`. When it is true, `Relations::load(…, true)` runs and each row with `recurrence` gets `recurrence_exceptions` attached, the same way as `listing.rs:106`. This is additive and older clients never send it. No other server change. The file is built on the device only.
- **Builder** `buildCalendarIcsExport(events: CalendarEvent[], options: { calendarName: string; timezone?: string | null }): EventIcsExport` in `event-ics-export.ts`:
  - Throws `EventIcsExportError("Some events are still encrypted on this device, so the calendar can't be exported yet.")` if any event is `encryptionState === "encrypted" && !isDecryptedEventReminderContent(event)`. This is the same rule as `:52`.
  - Any row with `recurrence` is exported as a **series** with UID `externalId || \`${id}@solace-calendar.local\``, which matches the existing rule. Each exception with `type === "deleted"` becomes an `exceptionDates` entry. Each `type === "modified"` exception whose `modifiedEventId` is in the set exports that child row as an **override**: same UID as the series, `recurrenceId = exceptionDate`.
  - Child rows that are not referenced as overrides, including split halves that have their own `recurrence`, export standalone under their own UID. `isCancelled` sets `status: "CANCELLED"`. Participants, description and location go through as today.
  - Filename: `toSafeIcsFilename(calendarName)`; "all" uses `calendarName = "Solace calendars"` (→ `solace-calendars.ics`).
- **calendar-ics** (`index.ts`):
  - `IcsBuildEventInput` gains `recurrenceId?: Date | null` and `exceptionDates?: Date[]`.
  - Rule: a *timed* event with `recurrence` or `recurrenceId` whose resolved zone (`normalizeIcsTimezone(event.timezone ?? calendarTimezone)`) is not UTC writes `DTSTART;TZID=<iana>:YYYYMMDDTHHMMSS`, `DTEND;TZID=…`, `EXDATE;TZID=<iana>:a,b`, `RECURRENCE-ID;TZID=…`. All other timed events keep UTC `Z`, so single-event output does not change.
  - All-day events use `EXDATE;VALUE=DATE:` and `RECURRENCE-ID;VALUE=DATE:` via `formatDateStampInTimeZone` (`:307`).
  - `buildIcsCalendar` collects the TZIDs it used and emits one `VTIMEZONE` per TZID before the first `VEVENT`, through a new `buildVTimezoneLines(timezone, referenceYear = dtStamp UTC year)`.
- **VTIMEZONE algorithm** (no new dependency; Intl `DateTimeFormat.formatToParts` with `hour12:false` and `% 24` is available on Hermes, as `getZonedDateParts` in `calendar-core/src/timezone.ts:89` shows):
  - The offset in minutes at instant `t` is the zoned wall-clock read back as UTC, minus `t`.
  - If the offsets on 1 Jan and 1 Jul are equal, emit one `STANDARD` with `DTSTART:19700101T000000` and that offset.
  - Otherwise, scan the reference year day by day at 00:00Z and bisect each change to the minute. That gives two transitions. Each becomes an observance:
    - `DAYLIGHT` is the one that switches to the larger offset, `STANDARD` the one that switches to the smaller.
    - `TZOFFSETFROM`/`TZOFFSETTO` use `±HHMM`.
    - `RRULE:FREQ=YEARLY;BYMONTH=m;BYDAY=nDD`, where `n = -1` if `day + 7 > daysInMonth`, else `ceil(day/7)`.
    - `DTSTART` is the matching 1970 local onset date and time, so all years expand.
  - Ceiling: this encodes the *current* rule. Events in years before a rule change (for example US before 2007) and zones with non-weekday rules get approximate offsets. The 1970 anchor is what keeps it standards-conformant. Tests pin Amsterdam, New York, Sydney, Tokyo and UTC.
- **Shared loader** `loadCalendarIcsExport(api, { calendars: Pick<Calendar,"id"|"name">[]; timezone?: string; calendarName?: string }): Promise<EventIcsExport>` in a new `packages/calendar-client/src/calendar-ics-export.ts`. It pages the corpus with `includeExceptions: true`, keeps events whose `calendarId` is in `calendars`, and calls `buildCalendarIcsExport`. "All" passes the owned, non-`isSyncOnly` calendars (`partitionCalendarsByKind(...).ownedCalendars`). Feeds and holidays are excluded because they are someone else's published data.
- **Plaintext on disk (native):** write only under `Paths.cache/ics-export/` (constant `ICS_EXPORT_DIRECTORY`):
  - Delete the file in `finally`, as today.
  - Also wipe the whole folder before each write, at session start (`NavigationGuard` `prepareSession`) and on sign-out (`AuthProvider` `lifecycle.onSignedOut`). This mirrors mail's `clearAttachmentCache`.
  - The single-event share moves into the same folder, which fixes the leftover-file gap.
- Web stays in memory (Blob plus object URL, revoked right away), so there is no disk copy beyond the browser's download that the user asked for.
**Changes.**
- packages/calendar-ics: `index.ts`:
  - Extend `IcsBuildEventInput` and `buildEventLines` (TZID/EXDATE/RECURRENCE-ID).
  - Add `formatLocalDateTimeStamp(date, tz)` (h23 via `hour12:false`, `%24`), `buildVTimezoneLines`, and the VTIMEZONE emission in `buildIcsCalendar`.
- packages/calendar-core:
  - `event-ics-export.ts`: add `buildCalendarIcsExport`; reuse `toIcsRecurrenceRule` and `toSafeIcsFilename`.
  - `types.ts`: add `recurrenceExceptions?: Array<{ exceptionDate: string; modifiedEventId: string | null; type: string }>` to `CalendarEvent` (`:100`) and `includeExceptions?: boolean` to `EventSearchCorpusParams` (`:33`).
- crates/solace-api-types + apps/backend:
  - `EventSearchCorpusQuery` (`events.rs:333`) gets `include_exceptions: Option<bool>`.
  - `request_schema!(EventSearchCorpusQuery …)` (`apps/backend/src/events/routes.rs:41`) gets `("includeExceptions", optional_query_boolean())`.
  - The utoipa params on `search_corpus` (`routes.rs:135`) gain the same flag.
  - `listing.rs:343` loads exceptions when the flag is true and attaches them to recurring rows.
  - Run `cargo xtask openapi` and commit `packages/api-contracts`.
- packages/calendar-client:
  - `calendar-api-service.ts` `fetchEventSearchCorpus` (`:592`) sets `includeExceptions=true`.
  - `loadEventSearchCorpus` forwards `includeExceptions` through its `params` pick.
  - New `calendar-ics-export.ts`, exported from `index.ts`.
- apps/web:
  - New `lib/ics-download.ts` `saveIcsFile({icsContent, filename})`; refactor `downloadEventIcs` to use it.
  - New hook `hooks/use-calendar-ics-export.ts` (`useMutation`, toast on `EventIcsExportError`).
  - Buttons: "Export as .ics" in `components/calendar-manager/calendar-editor-view.tsx` (edit mode, owned calendars), and "Export all calendars" `ActionRow` (lucide `Download`) in `calendar-list-view.tsx` "Actions".
- apps/native-calendar:
  - `src/lib/event-ics-share.ts`: generalize to `shareIcsFile({icsContent, filename})` plus `clearIcsExportCache()`. `shareEventIcs` calls it.
  - New hook `src/hooks/use-calendar-ics-export.ts`, mirroring `use-event-ics-export.ts`.
  - `SheetItem` "Export .ics" (icon `share`) in `CalendarEditPage.tsx` (above "Delete calendar"); "Export all calendars" in `CalendarsListPage.tsx` (last section).
  - `app/_layout.tsx`: `<AuthProvider lifecycle={{ onSignedOut: clearIcsExportCache }}>` and `NavigationGuard prepareSession={() => clearIcsExportCache()}`. The wipe failure is logged, never thrown, so it cannot block startup.
**Compatibility.** The query flag is additive and optional, so shipped binaries are unaffected. No migration. Single-event output for non-recurring events is unchanged; recurring single-event exports gain TZID and VTIMEZONE, which is a fix.
**Tests.**
- New `packages/calendar-ics/src/vtimezone.test.ts`:
  - VTIMEZONE for Europe/Amsterdam (`-1SU` BYMONTH 3/10, `+0100`/`+0200`), America/New_York (`2SU`/`1SU`), Australia/Sydney (southern), Asia/Tokyo (single STANDARD), and UTC (no TZID).
  - The EXDATE and RECURRENCE-ID forms.
  - Round-trip through `parse-ics` (node-ical): a weekly 09:00 Amsterdam series stays 09:00 local in July.
- Extend `packages/calendar-core/src/__tests__/event-ics-export.test.ts`: series + deleted exception + override + split half + standalone + cancelled; a locked event throws.
- New `packages/calendar-client/src/__tests__/calendar-ics-export.test.ts`: filters by calendar, sends `includeExceptions`.
- Extend `apps/native-calendar/src/lib/event-ics-share.test.ts`: writes under `ics-export/`, deletes after share, and `clearIcsExportCache` removes the folder.
- API suite, extend `crates/solace-api-tests/tests/api/events_list.rs`:
  - `search-corpus?includeExceptions=true` returns `recurrenceExceptions` on series rows.
  - They are absent without the flag.
  - `includeExceptions=maybe` → 400.
**Docs.** §2 data minimization, append: "Calendar export builds the .ics on the device from the decrypted corpus (`loadCalendarIcsExport`); native writes it only under the cache's `ics-export/` folder, wiped at launch and on sign-out."
**Decisions.**
- Window export? **Default: no**, all events only.
- Include feeds and holidays in "all"? **Default: no.**
- Write VALARM from reminders? **Default: no** (YAGNI).
- VTIMEZONE from current rules only? **Default: yes**, documented ceiling.

### C2. Web keyboard navigation and go-to-date
**Effort** M · **Risk** low · **Touches** packages/ui, packages/calendar-core, packages/calendar-client, apps/web
**Why.** Keyboard users can only switch views today. The existing single-letter shortcuts also break WCAG 2.1.4 (Character Key Shortcuts, level A) because nothing turns them off.
**Current state.**
- `CALENDAR_VIEW_SHORTCUTS` M/W/T(3-day)/D/A and `useCalendarViewShortcuts` live in `packages/ui/src/components/calendar/use-calendar-view-shortcuts.ts:8,40`. They are used by `event-calendar.tsx:127` and `mobile-event-calendar.tsx:126`.
- `isShortcutBlocked` (`:17`) rejects any Shift/Meta/Ctrl/Alt, form fields, contenteditable, and dialogs or menus.
- Navigation handlers already exist in `EventCalendar`: `handlePrevious`/`handleNext`/`handleToday` (`event-calendar.tsx:148-173`), via `navigateCalendarInstant`. The toolbar shows view-letter tooltips (`event-calendar-toolbar.tsx:129-155`); Today/Prev/Next show none.
- The palette opens on Ctrl/⌘+., Ctrl+Shift+P and Ctrl+J (`apps/web/hooks/use-command-palette.ts:10-25`), so all palette shortcuts carry modifiers and there are no conflicts. Mail's j/k/c/'/'/? (`apps/web/hooks/use-mail-keyboard-shortcuts.ts`) live on `/mail` only, and their meanings match.
- `openNewEventEditor` is in `apps/web/hooks/use-dashboard-user-actions.ts:35`; `openSearchPalette` is in `components/command-palette-context.tsx:86`.
- Native go-to-date already exists: the mini calendar in `CalendarDrawerSheet`/`SidebarMiniCalendar`, plus "Go to today" (`CalendarDateBar.tsx:63`).
- Sealed preferences: `SEALED_USER_SETTINGS_FIELDS` and `preferenceSchemas` in `packages/calendar-core/src/user-settings-preferences.ts:10,50`. `UserSettings` is at `types.ts:373`.
- `sealUserSettings` (`packages/calendar-client/src/calendar-api-service.ts:954`) re-seals via `readUserSettingsPreferences(opened)`, which **drops unknown keys**. A client that does not know a new key erases it on its next settings write.
**Design.**
- Shortcut table, one constant `CALENDAR_SHORTCUTS: Array<{ key: string; label: string }>` exported next to `CALENDAR_VIEW_SHORTCUTS`. The help dialog and the hook both read it.
  - Existing: M/W/T/D/A.
  - **J** next period, **K** previous period (same as mail's j/k).
  - **N** today ("now"; T is already 3-day).
  - **G** go to date.
  - **C** new event, **/** search.
  - **?** shortcut help.
- Guard: the existing `isShortcutBlocked`, except Shift is allowed when `event.key === "?"`. Matching is on `event.key`, so it works on any layout.
- `useCalendarShortcuts(actions: { onViewChange; onPrevious; onNext; onToday; onGoToDate; onCreate?; onSearch?; onHelp }, enabled: boolean)` replaces `useCalendarViewShortcuts` in the same file, keeping the test file name. `MobileEventCalendar` passes only `onViewChange` (other keys are no-ops) and `enabled`.
- Go to date: `GoToDateDialog` (new `packages/ui/src/components/calendar/go-to-date-dialog.tsx`). It uses the ui `Dialog` and `Input type="date"` (native control, no picker library).
  - The default value is `formatCalendarDayKey(utcToPickerDate(currentDate, tz))`.
  - Submit: `parseCalendarDayKey` → `wallClockToUtc(day, 12, 0, tz)` → `setCurrentDate`. Noon avoids DST edges.
- Help: `CalendarShortcutsDialog` (new `calendar-shortcuts-dialog.tsx`). It is a ui `Dialog` with a `<dl>` of `<kbd>` keys, plus the palette shortcuts formatted with `formatShortcut` (`packages/ui/src/hooks/use-shortcut-label.ts`).
- **Off switch:** sealed preference `keyboardShortcuts: boolean`. It is absent by default, which means on, and the consumer reads it as `settings.keyboardShortcuts !== false`. It disables every single-letter shortcut, including the view letters. This satisfies WCAG 2.1.4.
- Fix the root cause of dropped keys: `sealUserSettings` spreads the raw opened object first (`...(isRecord(opened) ? opened : {})`) and then the known-field picks and changes. Future keys then survive older clients that ship this OTA.
- **Web-only (parity exception):** both native apps are iPhone-only (§9), so there is no hardware-keyboard surface. Native already has go-to-date and today navigation. Follow-up issue: none needed; state this in the PR.
**Changes.**
- packages/calendar-core:
  - `user-settings-preferences.ts`: add `"keyboardShortcuts"` to `SEALED_USER_SETTINGS_FIELDS` and `keyboardShortcuts: z.boolean()` to `preferenceSchemas`.
  - `types.ts`: `UserSettings.keyboardShortcuts?: boolean`.
- packages/calendar-client: `calendar-api-service.ts` `sealUserSettings` keeps unknown opened keys.
- packages/ui:
  - `use-calendar-view-shortcuts.ts`: table, guard and hook.
  - New `go-to-date-dialog.tsx` and `calendar-shortcuts-dialog.tsx`.
  - `event-calendar.tsx`:
    - New props `keyboardShortcuts?: boolean`, `onCreateShortcut?: () => void` and `onSearchShortcut?: () => void`.
    - Local `useState` for the two dialogs, no other state.
    - Wire `handlePrevious`/`handleNext`/`handleToday`.
  - `event-calendar-toolbar.tsx`: tooltips "Previous · K", "Today · N", "Next · J".
  - `mobile-event-calendar.tsx`: pass `enabled`.
- apps/web:
  - `components/calendar-with-data.tsx` passes `keyboardShortcuts={settings?.keyboardShortcuts !== false}`, plus `onCreateShortcut` (from `useDashboardUserActions().openNewEventEditor`) and `onSearchShortcut` (`openSearchPalette`).
  - `app/calendar/_client.tsx` `MobileLayoutContent` passes `keyboardShortcuts`.
  - `components/command-palette/command-palette-actions.ts` `toUpdateSettingsRequest` adds `keyboardShortcuts`.
  - `calendar-defaults-settings.tsx`: a `SettingToggleRow` "Keyboard shortcuts", described as "Single keys switch views and dates; press ? for the list."
**Compatibility.** No API or DTO change. Shipped native binaries that write sealed settings drop `keyboardShortcuts`, which reverts it to on (the safe default). Binaries with this OTA preserve it.
**Tests.**
- Extend `packages/ui/src/components/calendar/use-calendar-view-shortcuts.test.tsx`: each key dispatches; `enabled=false` blocks all; inputs and dialogs block; Shift is accepted only for `?`; modifiers block.
- New `go-to-date-dialog.test.tsx`: the Amsterdam day key maps to the right instant across DST.
- New `calendar-shortcuts-dialog.test.tsx`.
- Extend `packages/calendar-client/src/__tests__/user-settings-sealing.test.ts`: `keyboardShortcuts` round-trips; an unknown opened key survives a write.
- Extend `apps/web/__tests__/components/settings-toggle-rows.test.tsx` for the new toggle.
- `apps/web` `react-compiler.test.ts` must still pass.
**Docs.** §2 sealed settings sentence, change "App-only settings (theme, view, week start, working hours/days, sounds, durations, display toggles)" to "…display toggles, keyboard shortcuts)".
**Decisions.**
- Today key: **N** recommended. Alternatives: `.`, or remapping T (would break 3-day muscle memory).
- Arrow keys for prev/next? **Default: no.** They conflict with focus movement inside toolbars, listboxes and grids.
- Palette "Go to date…" command? **Default: no.** G plus the sidebar mini calendar cover it.

### C3. Calendar search operators
**Effort** M · **Risk** low · **Touches** packages/calendar-core, apps/web, apps/native-calendar
**Why.** On-device search is plain text only. Filters such as guest, place, calendar and date range make the private corpus useful without sending anything to the server.
**Current state.**
- `searchCalendarEvents(events, query, limit)` (`packages/calendar-core/src/title-search-index.ts:251`) builds title-index documents from the decrypted corpus and scores them with `scoreTitleIndexDocument` (`:170`).
- **Name clash:** `tokenizeSearchQuery(query): string[]` already exists in `mail-search-relevance.ts:40`. It is root-exported via `index.ts:31` (`export *`), and used by `title-search-index.ts:4`, `apps/web/lib/search/unified-search.ts:9` and tests.
- Callers:
  - Web `apps/web/hooks/use-unified-search.ts:153` merges calendar hits with `searchTitleIndex` stubs and mail.
  - Native `apps/native-calendar/src/lib/search/palette-search.ts:35` (`mergePaletteSearchResults`), from `CommandPalette.tsx:150`.
- Subpath exports pattern: `packages/calendar-core/package.json` `exports`.
**Design.**
- **Shared tokenizer** `packages/calendar-core/src/search-query.ts`, exported **only** via a new subpath `"./search-query"` (not from `index.ts`, to avoid the `export *` clash):
  ```ts
  export const SEARCH_OPERATOR_KEYS: readonly string[]; // calendar: guest, location, calendar, after, before, is; mail item appends its keys here
  export const NEGATED_TEXT_KEY = "text";                // reserved, not in SEARCH_OPERATOR_KEYS
  export type SearchQueryOperator = { key: string; value: string; negated: boolean };
  export type TokenizedSearchQuery = { terms: string[]; operators: SearchQueryOperator[] };
  export function tokenizeSearchQuery(input: string): TokenizedSearchQuery;
  ```
  Exact rules:
  1. Split on Unicode whitespace outside double quotes. An unterminated quote runs to the end of the input. Quotes are removed from output.
  2. A token `[-]key:value` where `key.toLowerCase()` ∈ `SEARCH_OPERATOR_KEYS`:
     - The split is at the **first** colon.
     - It becomes an operator with lowercase `key`, the `value` as typed (trimmed, quotes stripped; `key:"two words"` is one value) and `negated` = leading `-`.
     - An empty value (`location:`) stays a term.
  3. An unknown key (`re:foo`, `https://x`) stays a plain term, verbatim.
  4. `-word` or `-"two words"` (leading `-`, length > 1, not an operator) → `{ key: "text", value, negated: true }`. A lone `-` is dropped.
  5. `terms` keep input order and casing; a quoted phrase is one term that contains spaces.
  6. Pure function: no Intl, no lookbehind (Hermes).
- **Calendar operators** in a new `packages/calendar-core/src/calendar-search-filter.ts`. It exports `CALENDAR_SEARCH_OPERATOR_HINT` (UI copy) and `filterEventsBySearchOperators(events, operators, context)`. Predicates, all matched as normalized substring (`normalizeSearchText`):
  - `guest:` any participant `email` or `displayName`.
  - `location:` `event.location`.
  - `calendar:` the calendar name from `context.calendars` by `calendarId`, falling back to `event.calendar?.name`.
  - `after:YYYY-MM-DD` keeps events with `end > wallClockFromCalendarDayKey(v, 0, 0, tz)`. Series rows match if the rule is open or `until ≥` that instant.
  - `before:YYYY-MM-DD` keeps `start <` that instant (exclusive, Gmail semantics). `tz = resolveTimezone(context.timezone)`; `parseCalendarDayKey` validates.
  - `is:recurring` = `recurrence || parentEventId || isRecurringInstance`; `is:allday` (alias `is:all-day`) = `allDay`.
  - `text` (negated words) = title, location or description contains.
  - `negated` inverts any predicate.
  - **Unsupported key or value** (for example a mail key, `is:unread`, or a bad date) → the calendar source returns `[]`. A mail-only query then shows only mail.
- `searchCalendarEvents(events, query, limit, context?: { timezone?: string | null; calendars?: Array<Pick<Calendar,"id"|"name">> })`:
  - Tokenize, then filter.
  - Score with the existing scorer on `terms.join(" ")`. Terms that contain whitespace must also appear as a substring (phrase).
  - With no terms, every filtered event scores 1, using the existing timestamp tie-break.
- `hasSearchOperators(query)` (in `search-query.ts`). When true, web and native drop `searchTitleIndex` stub hits, which cannot be filtered.
- Hint copy shown in the empty state on both platforms: "Filter with guest:, location:, calendar:, after:2026-12-01, before:, is:recurring, is:allday, -word".
**Changes.**
- packages/calendar-core:
  - New `search-query.ts` and `calendar-search-filter.ts`; `package.json` exports `"./search-query"`.
  - `title-search-index.ts`: `searchCalendarEvents` context param (import the tokenizer as `tokenizeSearchOperators` to avoid the local name clash).
  - `index.ts` exports `calendar-search-filter` (no clash).
- apps/web:
  - `hooks/use-unified-search.ts`: options gain `calendarSearchContext`; skip title-index hits when `hasSearchOperators`.
  - The caller in the palette controller passes `{ timezone: settings.timezone, calendars: calendarData.calendars }`.
  - `components/command-palette/main-search-view.tsx`: hint under "Searches mail, calendar, and settings".
- apps/native-calendar:
  - `src/lib/search/palette-search.ts`: `mergePaletteSearchResults` takes `context`; skip `localHits` when operators are present.
  - `src/components/CommandPalette.tsx` passes `useUserTimezone()` and `useCalendars().data`, and shows the hint in the empty state.
**Compatibility.** Client-only, so nothing reaches the server and there is no API change. The root `tokenizeSearchQuery` (mail relevance) is untouched.
**Tests.**
- New `packages/calendar-core/src/__tests__/search-query.test.ts`, as a table covering:
  - quotes and unterminated quotes;
  - `key:"a b"`;
  - first-colon split (`after:2026-11-01T10:00`);
  - unknown key, empty value and URL stay terms;
  - `-word`, `-"phrase"`, `-location:x`, lone `-`;
  - case-insensitive keys.
- New `calendar-search-filter.test.ts`: each operator and its negation; after/before at the Amsterdam DST boundary; series `until`; unsupported key → `[]`.
- Extend `title-search-index.test.ts`: operator-only query; phrase term.
- Extend `apps/native-calendar/src/lib/search/palette-search` tests (create `palette-search.test.ts` if absent).
- Extend `apps/web/__tests__/lib/unified-search.test.ts`.
**Docs.** §2, after "Calendar search runs on the decrypted corpus on the device …", add: "Search operators (`calendar-core/search-query`) are parsed and applied on the device too."
**Decisions.**
- Relative dates (`after:today`)? **Default: no**, ISO days only.
- Should an unsupported operator exclude the source rather than become text? **Default: exclude.**
- Sort order for operator-only queries? **Default: existing timestamp tie-break.**

### C4. Quick add in plain language
**Effort** M · **Risk** med · **Touches** packages/calendar-core, apps/web, apps/native-calendar
**Why.** Typing "Lunch with Ana tomorrow 1pm" should fill the date and time instead of three pickers. Parsing on the device keeps it private.
**Current state.**
- Web create title input: `apps/web/components/event-editor/event-editor-body.tsx:176-190`. Enter submits; `autoFocus` when new.
- The form API has `setEventTitle/StartDate/EndDate/StartTime/EndTime/AllDay` (`apps/web/hooks/use-event-form.ts:213-220`). Seeding uses `getEventPickerDateRange` and `formatTimeForInput` (`:404-415`).
- Native title field: `apps/native-calendar/src/components/event/EventFormTitleField.tsx`, used in `EventForm.tsx:226` with `updateFields`. `start`/`end` are picker ISO strings (`toTimezonePickerISOString`, `event-form-utils`).
- Zone helpers: `utcToPickerDate`, `wallClockToUtc`, `pickerDateToAllDayUtcRange` (`packages/calendar-core/src/timezone.ts:140,157,184`). Formatting: `formatInUserTimezone`, `clockTimePattern` (`time-format.ts:14`).
**Design.**
- Entry point is the **create editor's title field on both platforms**, not a separate palette mode. As the user types, a suggestion row appears under the title when the text parses. The row reads, for example, "Use Tue 18 Nov · 13:00–14:00" or "Use Tue 18 Nov · All day". Activating it applies the parsed title, start, end and all-day. The editor fields are the preview, and Save is the confirmation, so nothing is ever saved automatically. When nothing parses, no row appears and the user is in the normal editor (the fallback).
- Parser `parseQuickAdd(input: string, options: { now: Date; timezone: string; defaultDurationMinutes: number }): QuickAddResult | null`. It lives in a new `packages/calendar-core/src/quick-add.ts`, exported from `index.ts`, with `QuickAddResult = { title: string; start: Date; end: Date; allDay: boolean }`. English only; case-insensitive; regex plus tables; no Intl and no lookbehind (Hermes).
  - **Date**:
    - `today`, `tonight` (default 19:00 when no time), `tomorrow` or `tmrw`.
    - A weekday name, full or abbreviated (`mon`, `tue`/`tues`, `wed`, `thu`/`thur`/`thurs`, …), optionally after `on` or `this`. It means the soonest date ≥ today. `next <weekday>` means the soonest date > today.
    - `in N day(s)|week(s)`.
    - `YYYY-MM-DD`.
    - `D month [YYYY]`, `month D[st|nd|rd|th] [YYYY]`, `Dth of month`. A year-less past date rolls to next year.
    - Numeric slash dates are **not** parsed (D/M vs M/D ambiguity).
  - **Time**:
    - `5pm`, `5 pm`, `5:30pm`, `17:30`, `noon`, `midnight`.
    - `at H` without a meridiem: 1–7 → pm, otherwise as written (documented heuristic).
    - `in N min(s)|minute(s)|hour(s)|hr(s)` → `now + N`.
  - **Range**: `5-6pm`, `5pm-6pm`, `17:00–18:30` (hyphen or en dash), `from X to Y`. The start inherits the end's meridiem when it has none and start ≤ end. An end ≤ start moves to the next day.
  - **Duration**: `for 30 min`, `for 2 hours`, `for 1h`, `for 90m`, `for 1.5 hours`.
  - **`all day`/`all-day`** forces all-day.
  - A date with no time → all-day. A time with no date → today.
  - `end` = range end, else start + duration, else `defaultDurationMinutes`.
  - **Zoning**:
    - The calendar day is `utcToPickerDate(now, tz)` plus days (`date-fns` `addDays` on the picker date).
    - Timed events use `wallClockToUtc(day, h, m, tz)`.
    - All-day events use `pickerDateToAllDayUtcRange(day, endDay, tz)`.
  - **Title**: the input with matched spans removed. A dangling connector (`at`, `on`, `from`, `for`) is removed only when it sits directly before a removed span. Whitespace collapses. So "Dinner at Noma tomorrow 8pm" → "Dinner at Noma".
  - Returns `null` if no date or time phrase matched.
- Shared label `formatQuickAddSummary(result, tz, timeFormat)` in the same file, so both platforms show the same text.
**Changes.**
- packages/calendar-core: new `quick-add.ts`.
- apps/web:
  - `event-editor-body.tsx`: when creating (`!eventForm.selectedEvent?.id`), render a `QuickAddSuggestion` (new `components/event-editor/quick-add-suggestion.tsx`).
  - The suggestion is a real `Button` variant "ghost" in an `aria-live="polite"` region, under the title.
  - It calls a new `eventForm.applyQuickAdd(result)` in `use-event-form.ts`, which uses `getEventPickerDateRange` and `formatTimeForInput`, then the setters.
  - Enter in the title keeps submitting (unchanged).
- apps/native-calendar:
  - `EventFormTitleField.tsx` takes an optional `suggestion` (`QuickAddResult | null`) and `onApplySuggestion`, and renders a pressable row (accent text via `theme.colors.primaryBase`, 44pt target, `accessibilityRole="button"`).
  - `EventForm.tsx` computes `parseQuickAdd(fields.title, …)` only in create mode; it gets a new `isCreate` prop from `EventSheet` `mode.type === "create"`.
  - It applies with `updateFields({ title, start: toTimezonePickerISOString(start, tz), end: …, allDay })`.
**Compatibility.** Client-only. No API change, nothing stored.
**Tests.**
- New `packages/calendar-core/src/__tests__/quick-add.test.ts`:
  - Fixed `now = 2026-11-14T10:00:00Z` with Europe/Amsterdam; a DST case with America/New_York (`tomorrow 9am` on 2026-03-07).
  - Covers every grammar row above, title stripping, null on plain text, and the `at 3` heuristic.
- `apps/web/__tests__/components/event-editor-body.test.tsx`: the row appears and applying fills the fields; it is not shown when editing.
- New `apps/native-calendar/src/components/event/quick-add-title.test.tsx`.
**Docs.** None (no convention change).
**Decisions.**
- Also add a palette "new event: …" mode? **Default: no.** The C shortcut plus the title field covers it.
- Auto-apply without a tap? **Default: no.** It avoids surprises like "Meeting at 5" being rewritten.
- Languages other than English? **Default: English only.**

### C5. Drag-to-create and resize
**Effort** L · **Risk** med · **Touches** packages/ui, packages/calendar-core, apps/web, apps/native-calendar
**Why.** Today web events can only be moved, and native cannot sweep out a time range. Both are basic calendar gestures.
**Current state.**
- Web DnD is dnd-kit (`packages/ui/src/components/calendar/calendar-dnd-context.tsx`, sensors `:105-125`, `handleDragEnd` `:224`).
- Events are `DraggableEvent` (`draggable-event.tsx`; dnd listeners only on `EventItem`, `:146`).
- Time grids render quarter-hour `DroppableCell`s with `data-calendar-cell`, `data-cell-date` and `data-cell-time` (`droppable-cell.tsx:58-60`), clicking to create at that quarter (`week-view-time-grid.tsx:117-137`). The same pattern is in `three-day-view-time-grid.tsx` and `day-view.tsx`.
- Drops persist via `persistDraggedCalendarEvent` (`event-calendar-mutations.ts:114`), which routes recurring events through `moveRecurringEvent`, the existing this/following/all prompt (`apps/web/hooks/use-recurring-move-prompt`). Its toast always says "moved".
- `EventCalendar.handleEventCreate(startTime)` (`event-calendar.tsx:201`) opens the editor popover with `start + defaultEventDuration`.
- Web `updateEventMutation` (`apps/web/hooks/use-calendar-data.ts:320`) has **no optimistic update**. The helpers `snapshotEventCache`/`mapCachedEvents`/`restoreEventCache` (`:79-102`) already exist.
- Native: `NativeTimelineCalendar.tsx:419-420` `allowDragToEdit` (move and resize exist) and `allowDragToCreate={false}`. `@howljs/calendar-kit` 2.5.6 supports `allowDragToCreate`, `dragToCreateMode: 'duration' | 'date-time'`, `defaultDuration` and `onDragCreateEventStart/End(OnCreateEventResponse {start,end})` (`node_modules/@howljs/calendar-kit/lib/typescript/types.d.ts:193-195,402-434`).
- The create sheet takes `{ type: "create"; date?; hour? }` (`apps/native-calendar/src/components/event/EventSheet.tsx:44`), seeded by `eventSheetInitialValues` (`event-sheet-initial-values.ts:40`).
**Design.**
- **Web, one pointer hook for both gestures**, plain Pointer Events (no new dnd-kit draggables). New file `packages/ui/src/components/calendar/use-time-grid-pointer-range.ts`, attached to each day column in the three time grids. Gestures by mode:
  - `create`: `pointerdown` on an empty `[data-calendar-cell]`, mouse or pen only. Touch keeps scrolling, and the mobile-web views are untouched.
  - `resize-start`/`resize-end`: `pointerdown` on a new `EventResizeHandle`.
  - The handle is a sibling of `DraggableEvent` inside the positioned wrapper (`week-view-time-grid.tsx:70-103`), so it never reaches dnd-kit listeners. It is `absolute inset-x-0 h-1.5 cursor-ns-resize`, top or bottom, `aria-hidden`.
  - Handles show only for `canCurrentUserEditEvent(event)`, on timed and non-preview events, and on the first (start) or last (end) day segment.
- Shared gesture behavior:
  - `setPointerCapture`. On `pointermove`, `document.elementFromPoint` → `closest('[data-calendar-cell]')`, restricted to the anchor's `data-cell-date` (same-day only).
  - Snap to the 15-minute cells, minimum 15 minutes. Escape cancels.
  - The pure range math, `normalizeTimeGridRange(anchorQuarter, currentQuarter, mode)`, goes in `timeline-layout.ts` with tests.
  - `pointerup` with no cell change does nothing, so the existing cell click still creates. After a real drag, one capture-phase click is swallowed.
- Preview: one `TimeGridSelection` component (new `time-grid-selection.tsx`), positioned with the same px math `timeline-layout.ts` uses (`translateY` for top, `height` set directly per pointer move, **no CSS transition**). It uses tokens (`bg-accent/15 border border-accent`). This is direct manipulation, not animation, so the §7 transform/opacity animation rule holds.
- Commit:
  - Create calls `handleEventCreate(start, end)`, which gains an optional `end`, and anchors the popover at the pointerup point.
  - Resize calls `handleEventUpdate({ ...event, start|end })` → `persistDraggedCalendarEvent`, which gets a new `verb: "moved" | "resized"` for its toast. Recurring events get the existing scope prompt for free.
- **Optimistic:** `updateEventMutation` gains `onMutate` that patches `{start,end,allDay}` on the cached event with `mapCachedEvents`, an `onError` restore and the existing narrow `onSuccess` invalidation. Moves benefit too.
- **Accessibility:** WCAG 2.5.7 is met by the single-pointer alternatives (a click on a cell creates; the editor's time fields resize). The keyboard alternative is **C** (C2) or the New event button plus the editor time fields. Handles stay `aria-hidden`, consistent with `draggable-event.tsx:63`.
- **Native:**
  - Set `allowDragToCreate`, `dragToCreateMode="date-time"` and `defaultDuration={defaultEventDuration}`, with a new `NativeTimelineCalendar` prop taken from settings.
  - `onDragCreateEventStart` sets `isDraggingRef` (like `handleDragEventStart`, `:229`).
  - `onDragCreateEventEnd` → new adapter `kitCreatedRangeToInstants(created, tz)` in `calendar-kit-adapter.ts` → new prop `onTimeRangeCreate({start, end})` → `app/calendar/index.tsx` → `openEventSheet({ type: "create", start: iso, end: iso })`.
  - `EventSheetMode` create gains `start?: string; end?: string` (UTC ISO). `eventSheetInitialValues` uses them before `date`/`hour`.
  - The kit uses Reanimated, which honors Reduce Motion. `useHaptic` is already on.
  - Verify the kit's create placeholder uses `kitTheme` tokens.
**Changes.**
- packages/ui:
  - New `use-time-grid-pointer-range.ts`, `time-grid-selection.tsx` and `event-resize-handle.tsx`.
  - `timeline-layout.ts` (`normalizeTimeGridRange`).
  - Wire into `week-view-time-grid.tsx`, `three-day-view-time-grid.tsx` and `day-view.tsx`.
  - `event-calendar.tsx`: `handleEventCreate(start, end?)`.
  - `event-calendar-mutations.ts`: `verb`.
- apps/web: `hooks/use-calendar-data.ts` `updateEventMutation.onMutate/onError`.
- apps/native-calendar:
  - `NativeTimelineCalendar.tsx` (props and kit props), `calendar-kit-adapter.ts`, `app/calendar/index.tsx`.
  - `EventSheet.tsx` (`EventSheetMode`), `event-sheet-initial-values.ts`.
**Compatibility.** Client-only, no API change. Mobile web is unchanged (touch ignored).
**Tests.**
- Extend `packages/ui/src/components/calendar/timeline-layout.test.ts` (`normalizeTimeGridRange`: reversed drag, min 15 min, clamp at the day end).
- New `use-time-grid-pointer-range.test.tsx` (jsdom pointer events: a click still creates once; a drag creates the range; Escape cancels; the end-resize commit calls `onEventUpdate`).
- Extend `event-calendar-mutations.test.ts` (resized toast, recurring routes to `moveRecurringEvent`).
- Extend `apps/web/__tests__/hooks/use-calendar-data-recurring.test.ts`, or add `use-calendar-data-optimistic.test.ts` (rollback on error).
- Extend `apps/native-calendar/src/components/calendar/calendar-kit-adapter.test.ts` (`kitCreatedRangeToInstants` across DST) and an `event-sheet-initial-values` test.
**Docs.** None.
**Decisions.**
- Cross-day and all-day-row drag-create? **Default: no** (same day, timed grid only).
- Touch drag-create on mobile web? **Default: no** (native apps cover phones).
- Live resize preview of the event block itself? **Default: no**; the shared selection ghost is enough.

### C6. Undo and 30-day trash for deleted events
**Effort** L · **Risk** high · **Touches** apps/backend (migration, events, recurring, account), crates/solace-api-types, packages/api-contracts, packages/calendar-core, packages/calendar-client, apps/web, apps/native-calendar, apps/notifications, crates/solace-api-tests
**Why.** Deletes are permanent ("This action cannot be undone", `apps/native-calendar/src/hooks/use-recurring-scope-actions.ts:11`; web `getEventDeleteConfirmCopy`, `apps/web/lib/event-editor-view-model.ts:28`), so one mis-tap loses encrypted data that no one can recover.
**Current state.**
- `events::service::delete` (`apps/backend/src/events/service.rs:685-727`):
  - Attendee invitation copies (`external_id` plus `attendee_copy`) are declined and purged (`rsvp::respond` and `rsvp::purge`, `:699-707`).
  - Otherwise, in one transaction: `delete_reminders`, `delete_notification_logs` and `queries::delete` (`events/queries.rs:392`, which deletes the row plus exceptions where `parent_event_id` is in ids; it does **not** delete child rows).
  - Bulk delete: `:799-827`.
- Recurring delete:
  - `recurring/service.rs:470`. `this_only` inserts or marks a `deleted` exception; `this_and_future` truncates the rule (`split`).
  - `all` calls `queries::delete_series` (`recurring/queries.rs:62`): exceptions, child rows, then the row. This runs without a transaction.
- FKs (baseline):
  - `event_notification`/`event_participant` cascade from `calendar_event`.
  - `recurrence_exception.modified_event_id` is `SET NULL`; `parent_event_id` has no FK.
  - `calendar_event.calendar_id` cascades from `calendar`.
- No cancellation mail is ever sent on delete (no outbound CANCEL in `invitations/`).
- The worker schedules due `event_notification` rows by joining `calendar_event` (`apps/notifications/src/schedule.rs:39`).
- Retention: `apps/notifications/src/retention.rs:29` `rules()` and the windows test at `:136`. README table: `apps/notifications/README.md:36-42`.
- Account deletion is `account/queries.rs:24` `delete_user`, which ends in a `user` delete that cascades. `release_participations` scrubs the deleted user's link, name and RSVP on others' events and keeps the typed email. The suite scans every table for leftovers: `crates/solace-api-tests/tests/api/account_deletion.rs:30-75`, with fill at `:205`.
- Clients:
  - Web: `use-calendar-data.ts:348` (`deleteEventMutation`), `:407`; `deleteEvent: Promise<void>` at `:218`, `:220`; `hooks/use-event-delete-prompt.ts:44-74`; editor delete `use-event-form.ts:909`.
  - Native: `use-event-sheet-mutations.ts:187` `useDeleteEventMutation` (optimistic remove plus rollback).
  - `persistRecurringEventDelete` returns `void` (`packages/calendar-client/src/recurring-event-persistence.ts:64`).
- Toasts: web action toasts stay until dismissed (`packages/ui/src/lib/toast.ts`); native `ToastOptions.action` exists (`packages/native-core/src/providers/ToastProvider.tsx:35-43`).
**Design.**
- **Storage: a separate `event_trash` table, rows moved out of `calendar_event`, not a `deleted_at` column.**
  - A column would be ignored by the previous deployment during overlap and after a rollback. Old instances would list, search, export (`search-corpus`), upgrade-sweep and schedule reminders for trashed events, and every existing query would need a new filter. A missed filter leaks trashed events into public feeds.
  - Moving the rows makes a trashed event simply absent everywhere, including in old instances. That is exactly today's delete semantics.
  - The old deployment ignores the new table. During overlap, an old instance's delete is permanent and a new instance's delete is recoverable; both are safe.
- **Migration** `m20261114_120000_event_trash` (`cargo xtask migrate new event_trash`):
  ```sql
  CREATE TABLE event_trash (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    event_id text NOT NULL,      -- root row, restored under the same id
    calendar_id text NOT NULL,   -- no FK: the calendar may be deleted meanwhile
    rows jsonb NOT NULL,
    trashed_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX event_trash_user_id_trashed_at_idx ON event_trash (user_id, trashed_at DESC);
  CREATE INDEX event_trash_trashed_at_idx ON event_trash (trashed_at);
  ```
  - Register it in `apps/backend/src/db/migrations.rs`.
  - Run `cargo xtask entities` (new `db/entities/event_trash.rs`).
  - Add `event_trash: id` to the `behavior!` list in `db/behavior.rs`.
  - The user FK cascade covers account deletion even by an old API instance.
- **`rows` format** (version-free; keys are column names via `to_jsonb`):
  `{"events":[to_jsonb(calendar_event)…], "exceptions":[to_jsonb(recurrence_exception)…], "reminders":[to_jsonb(event_notification)…], "participants":[{"eventId","email","role","status"}…]}`
  - Participants keep **only** email, role and status. There is no `user_id` (FK) and no display name, so account deletion needs no JSON scrub.
- **What is trashable:** DELETE `/api/events/{id}`, bulk `delete` and recurring `deleteScope=all`, for events that are **not** attendee invitation copies. Attendee copies keep today's decline, purge or delete paths.
  - `this_only`/`this_and_future` stay permanent in this PR. Their confirm copy keeps "can't undo"; follow-up issue to add trash entries for them.
  - No mail on trash, restore or purge (unchanged: Solace sends no CANCEL today).
- **Trash operation** `trash_events(txn, user_id, root_ids) -> Vec<String>` in a new `apps/backend/src/events/trash.rs`, run inside the existing delete transaction. Recurring `all` now gets one too. Per root:
  1. `ids` = root + `SELECT id FROM calendar_event WHERE user_id=$1 AND parent_event_id=root`. This also fixes the orphaned children of a plain series delete.
  2. Build `rows` in one statement with `jsonb_build_object` and `coalesce(jsonb_agg(...),'[]')`:
     - events by `id = ANY(ids) AND user_id`;
     - exceptions by `parent_event_id = ANY(ids) OR modified_event_id = ANY(ids)`;
     - reminders by `event_id = ANY(ids)`;
     - participants.
     Skip if events is empty (a concurrent delete already happened).
  3. Insert `event_trash`.
  4. Today's deletes: `delete_reminders`, `delete_notification_logs`, exceptions with parent in `ids`, rows in `ids`.
  `queries::delete` and `delete_series` stay for `rsvp::purge` (`rsvp.rs:135`).
- **Restore** `POST /api/events/trash/{id}/restore`, in one transaction:
  1. `SELECT … FOR UPDATE` by `id` and `user_id`. Missing → 404. This makes a double restore return 404.
  2. Target calendar:
     - the original if it is owned and `is_writable` (`events/service.rs:127`);
     - else the owned writable `is_default` calendar (not staging, `calendars/queries.rs` `not_staging()`);
     - else the first owned writable calendar;
     - none → `AppError::Conflict("No calendar to restore into")`.
  3. Rewrite each event JSON: `calendar_id`, `category_id = null` unless it is still the user's, `updated_at = now`.
  4. Reinsert with a generic helper `reinsert(txn, table, columns, rows, filter)`:
     ```sql
     INSERT INTO "t" (cols) SELECT cols FROM jsonb_populate_recordset(NULL::"t", $1) [WHERE filter]
     ```
     - `cols` = the entity's `Column::iter()` names ∩ the keys present. Identifiers come only from the generated entities, never from JSON.
     - Missing keys therefore take DB defaults, and dropped columns are ignored, so the format survives schema drift.
     - Order: events (unique violation → 409); exceptions with `ON CONFLICT (parent_event_id, exception_date) DO UPDATE SET type, modified_event_id, updated_at`, which relinks a restored detached occurrence; reminders `WHERE NOT is_sent AND notification_time > (now() AT TIME ZONE 'UTC')`.
  5. Participants: per event, `participants::sync(txn, event_id, inputs, None)` (no mail; resolves users by email).
  6. Delete the trash row and commit. Return the root as `Event` via `view::one`.
  - Ciphertext is untouched, so it stays E2EE. The search-token trigger runs on insert. The client's `upgradeStoredEncryption` sweep picks up any old-form row later.
- **Purge:** `DELETE /api/events/trash/{id}` (404 if not owned) and `DELETE /api/events/trash` (empty). Both answer `SuccessMessage`.
- **Retention:** `batch_delete("event_trash", 30, "event_trash", "trashed_at < $1")` in `retention.rs` `rules()`.
- **DTOs** (`crates/solace-api-types/src/events.rs`; `TrashedEventId` added to `id_types!` in `common.rs:87`):
  - `TrashedEvent`:
    - `{ id: TrashedEventId, eventId, calendarId, calendarMissing: bool, title, encryptedContent: Option, encryptionState, encryptionKeyVersion, start, end, allDay, timezone, recurrence: Option, trashedAt, purgeAt }`, with `#[schema(required = true)]` on the always-written optionals.
    - It is read from the root event JSON with a private serde struct.
    - A slim DTO, because `view::event_dto` requires the calendar row (`view.rs:152-155`).
  - `TrashedEventList { events: Vec<TrashedEvent> }`, newest first.
  - `EventDeleted` and `RecurringDeleted` gain `trash_id: Option<TrashedEventId>` (`#[serde(default, skip_serializing_if = "Option::is_none")]`, `#[schema(nullable = false)]`). Bulk keeps its DTO.
- **Routes** (`apps/backend/src/events/routes.rs`; `RouteUser` first; static `/trash` segments win over `/{id}` like `/search`):
  - `listTrashedEvents` GET `/api/events/trash`
  - `restoreTrashedEvent` POST `/api/events/trash/{id}/restore` → `Event`
  - `deleteTrashedEvent` DELETE `/api/events/trash/{id}`
  - `emptyEventTrash` DELETE `/api/events/trash`
  - Run `cargo xtask openapi`.
- **Clients:**
  - `calendar-client`:
    - `listTrashedEvents(): Promise<TrashedCalendarEvent[]>` maps each entry to a partial `CalendarEvent` and runs `hydrateEncryptedEvent` for titles.
    - `restoreTrashedEvent(id): Promise<CalendarEvent>`, `deleteTrashedEvent(id)` and `emptyEventTrash()` (paths with `encodeURIComponent`).
    - `deleteEvent` already returns `EventDeleted`. `persistRecurringEventDelete` returns `Promise<string | null>` (the trash id).
  - Shared key `EVENT_TRASH_QUERY_KEY = ["event-trash"] as const` in `packages/calendar-core/src/calendar-query-keys.ts`; web `webQueryKeys.eventTrash()` and native `QUERY_KEYS.eventTrash()`.
  - **Undo:**
    - After a trashable delete, web shows `toast.success("Event moved to Trash", { action: { label: "Undo", onClick } })`. Action toasts stay until dismissed, which is fine because restore works for 30 days.
    - Native shows `toast("Event moved to Trash", "success", { action: { label: "Undo", onPress } })`.
    - Undo calls the restore mutation:
      - `onMutate` removes the entry from the trash cache.
      - `onError` rolls back.
      - `onSettled` invalidates the trash key, plus `invalidateEventRanges` for a non-recurring event or the events root for a recurring one (the existing create pattern).
    - Delete mutations also invalidate the trash key.
  - **Trash UI:**
    - Web: palette view `"trash"`, added to `PaletteView` (`components/command-palette/constants.ts:253`) and `VIEW_LABELS`. It is reachable from an `ActionRow` "Trash" in `calendar-manager/calendar-list-view.tsx` and a `COMMANDS` entry "Trash" → action `openTrash` in `use-command-palette-controller.ts`.
    - Web component: new `components/calendar-manager/event-trash-view.tsx` with rows (title, date, "Deleted 14 Nov · removed 14 Dec"), Restore and "Delete forever" buttons, and an "Empty trash" button with `EventConfirmDialog`. It covers loading, empty ("Trash is empty. Deleted events stay here for 30 days.") and error states.
    - Native: `TRASH_PAGE = "trash"` in `src/lib/calendars-sheet-pages.ts`, a `SheetItem` "Trash" (icon `trash-2`) in `CalendarsListPage.tsx`, and a new `src/components/calendars/TrashPage.tsx` (`SheetSubPage`). Pressing a row opens an `Alert` with Restore, Delete forever and Cancel. It also has an "Empty trash" destructive item.
    - Hooks: web `hooks/use-event-trash.ts`, native `src/hooks/use-event-trash.ts`.
    - Shared `formatTrashEntryDetail(entry, tz)` in calendar-core. It uses `formatInUserTimezone` with no `Intl.RelativeTimeFormat` (Hermes).
    - If a restore landed in another calendar, toast "Restored to <name>".
  - **Copy:**
    - Web `getEventDeleteConfirmCopy` description → "It moves to Trash for 30 days."
    - Native `confirmDelete` (`use-recurring-scope-actions.ts:10`) takes the scope; it says "It moves to Trash for 30 days." unless the scope is `this_only`/`this_and_future`.
    - `SwipeableEventRow.tsx` is unused (no importers), so delete it rather than updating its copy.
**Changes.**
- crates/solace-api-types: `events.rs`, `recurring.rs`, `common.rs`.
- apps/backend:
  - New migration, entity and `behavior.rs`.
  - New `events/trash.rs`; `events/service.rs` `delete` and `bulk`; `recurring/service.rs` `_` branch (transactional).
  - `events/routes.rs` (4 routes, schemas via `request_schema!` for the path id only).
- packages/api-contracts: regenerate.
- packages/calendar-core: query key, `formatTrashEntryDetail`.
- packages/calendar-client: as above.
- apps/web:
  - `use-calendar-data.ts` (`deleteEvent`/`deleteRecurringEvent` return the trash id; invalidate the trash key).
  - `use-event-delete-prompt.ts`, `use-event-form.ts:909` (undo toast).
  - New hook and view; palette wiring.
  - `lib/event-editor-view-model.ts` copy.
- apps/native-calendar: `use-event-sheet-mutations.ts` (`onSuccess(trashId)` undo toast), `use-recurring-scope-actions.ts`, new page and hook, `calendars-sheet-pages.ts`, `CalendarsListPage.tsx`, delete `SwipeableEventRow.tsx`.
- apps/notifications: `retention.rs` rule plus the windows test; `README.md` row "`event_trash` | `trashed_at` older than 30 days (deleted events' restore window)".
**Compatibility.**
- Shipped binaries call the same delete routes. Their events now land in Trash, which only makes them recoverable. Their "cannot be undone" copy is merely conservative.
- New DTO fields are additive.
- Deploy overlap and rollback are safe (see Design). A rolled-back worker just pauses purging.
- Existing data is untouched.
- Restore tolerates later column additions: the column-intersection insert gives missing keys their defaults. The §3 rules already forbid `NOT NULL` without a default.
**Tests.**
- New `crates/solace-api-tests/tests/api/event_trash.rs` (plus `mod event_trash;` in `main.rs`):
  - Delete → 200 with `trashId`; GET event 404; the list entry has ciphertext only, `title` empty, and `purgeAt = trashedAt + 30d`.
  - Restore returns the same id and ciphertext, future unsent reminders, participants, and a series with its deleted exception and detached override relinked.
  - Restore after the calendar was deleted → default calendar, `calendarMissing` was true.
  - Restore after the category was deleted → null category.
  - Double restore → 404. Another user's id → 404 for list, restore and purge. 401 unauthenticated.
  - Purge one and empty all.
  - Recurring `all` → trashed with children; `this_only` → no entry.
  - Attendee invitation copy delete → no entry.
  - Bulk delete creates entries.
- Extend `account_deletion.rs` `fill_account` with a trashed event; the table scan then proves the cascade.
- Extend `apps/notifications/src/retention.rs` `windows_match_the_readme`.
- `packages/calendar-client/src/__tests__/event-trash.test.ts` (hydration, paths).
- `apps/web/__tests__/hooks/use-event-trash.test.tsx` (optimistic remove and rollback; undo toast action).
- `apps/web/__tests__/components/event-trash-view.test.tsx`.
- `apps/native-calendar/src/components/calendars/TrashPage.test.tsx`.
- Extend `calendars-sheet-pages.test.ts`.
**Docs.**
- §2, "**Accepted trade-off (decided):** `EventParticipant` … Never log them, never copy them elsewhere." → "Never log them or copy them elsewhere; only the event trash (`event_trash`) keeps a trashed event's participant emails, roles and statuses, for its 30 days."
- §2 data minimization, add: "Deleting an event moves its rows (ciphertext) into `event_trash` for 30 days (`/api/events/trash`, purged by the worker); occurrence-only deletes stay permanent."
- §6 table, add the row "Trash | `components/calendar-manager/event-trash-view.tsx` | native-calendar `src/components/calendars/TrashPage.tsx`".
**Decisions.**
- Keep the delete confirmations now that undo exists? **Default: keep them and change the copy** (smallest behavior change).
- Trash `this_only`/`this_and_future`? **Default: no**, follow-up.
- Delete pending `notification_job` rows on trash? **Default: no**, same as today.
- Restore target when the calendar is gone? **Default: the default calendar, automatically**, with a toast naming it.
- Paginate the trash list? **Default: no.** 30-day retention bounds it.

### T2. Web end-to-end tests with Playwright and an axe accessibility scan
**Effort** L · **Risk** med · **Touches** e2e/, xtask, apps/web (CSP), root package.json, CI
**Why.** Web has unit tests only. The native Maestro suite proves the real stack, and web needs the same, with accessibility measured on the rendered pages.
**Current state.**
- `cargo xtask e2e serve|seed|verify` (`xtask/src/e2e.rs`):
  - Loopback-only checks.
  - API on `127.0.0.1:4001` with `FRONTEND_URL`/`PASSKEY_ORIGIN = http://localhost:4100` (`crates/solace-api-tests/src/env.rs:150,172`).
  - `seed` claims invites and signs up `journey@` and `correspondent@solace.test` via the API, then writes `private/fixture.json` (`:80-133`).
  - `verify` checks for no readable "Maestro%" content plus encrypted calendars, events and sealed settings (`:135-186`).
- Services: `scripts/e2e/services.py start|wait-api|stop` (Podman on Linux).
- Workflows: `.github/workflows/native-e2e.yml`, `native-e2e-journeys.yml:20-145` (pattern to copy). `scripts/e2e/check_workflow.py` actionlints `native-e2e*.yml`.
- Web login supports `?invite=<token>` sign-up (`apps/web/app/login/login-form-params.ts:22`).
- Web scripts: `build` = `next build --turbopack`, `start` = `bun --bun next start` (`apps/web/package.json:7-9`).
- **CSP blocker:** `buildContentSecurityPolicy` adds `upgrade-insecure-requests` whenever not dev (`apps/web/lib/security-headers.ts:63`). A production build against the http loopback API would have its API calls upgraded to https.
- `bun run notices` walks only the `dependencies` of `SHIPPED_WORKSPACES` (`scripts/third-party-notices.ts:8,156`), so root devDependencies are out of scope. Both new licenses are in `AGPL_COMPATIBLE` anyway.
**Design.**
- **Serve the production bundle**: `next build`, then `next start --port 4100`. That is what ships: no React dev checks and the real CSP and React Compiler output.
  - Build env: `NEXT_PUBLIC_API_URL=http://localhost:4001` (`localhost`, not `127.0.0.1`, so auth cookies are same-site with `localhost:4100`), `NEXT_PUBLIC_APP_URL=http://localhost:4100`, `NEXT_TELEMETRY_DISABLED=1`.
  - CSP fix: omit `upgrade-insecure-requests` when `apiOrigin` is `http:` on a loopback host (`localhost`, `127.0.0.1`, `[::1]`). An http loopback API cannot be upgraded, and production APIs are https, so production headers do not change.
- **Accounts:**
  - `xtask e2e seed` also inserts an unclaimed invite for `browser@solace.test` and adds `inviteToken`/`inviteEmail` to `private/fixture.json`. Native ignores the extra keys.
  - The `signup` spec signs up through `/login?invite=…`, which initializes E2EE on the device.
  - The other specs use `journey@`, whose first web sign-in initializes its keys. Each spec signs in from a fresh context, unlocking from the password envelope. `storageState` cannot carry the non-extractable IndexedDB keys.
- **Layout** (`e2e/web/`):
  - `playwright.config.ts`:
    - Requires an absolute `SOLACE_E2E_DIR` whose basename is `solace-e2e`, as the native helpers do.
    - `testDir: "tests"`, `outputDir: $DIR/private/playwright`, `workers: 1`, `fullyParallel: false`, `retries: 0` (the no-replay rule), `forbidOnly: !!CI`, `timeout: 120_000`.
    - `use`: `baseURL: "http://localhost:4100"`, `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, `video: "off"`, `timezoneId: "Europe/Amsterdam"`, `locale: "en-US"`.
    - Projects: `signup` (`/signup\.spec\.ts/`), then `app` (Desktop Chrome, `dependencies: ["signup"]`).
    - Reporters: `list`, `junit` → `$DIR/artifacts/web/junit.xml`, `json` → `$DIR/artifacts/web/results.json`. **No HTML reporter**, because it copies traces.
    - `webServer: { command: "bun run --cwd apps/web start --port 4100", url: "http://localhost:4100/login", reuseExistingServer: false, timeout: 120_000 }`.
  - `tsconfig.json`: strict, extends the repo TS config.
  - `support/fixture.ts`: reads `private/fixture.json` and type-checks its fields; never logs.
  - `support/session.ts`: `signIn`, `signOut`, `waitForWorkspace` (waits for the loading overlay to leave).
  - `support/axe.ts`: `expectNoSeriousViolations(page, name)`:
    - Runs `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"])` and keeps `impact ∈ {serious, critical}`.
    - Writes `$DIR/artifacts/web/axe/<name>.json` with only `{id, impact, help, nodeCount}`.
    - Asserts `[]`. Rule exclusions only with a one-line reason.
- **Journeys** (`e2e/web/tests/`; fixture text prefixed "Playwright"):
  - `signup.spec.ts`: invite sign-up → calendar loads → sign out → sign in again (envelope unlock). Axe: `/login`.
  - `calendar.spec.ts`:
    - Create "Playwright event" in the editor, reopen, edit the title.
    - Delete → Undo toast → back (C6). Delete again → palette Trash → Restore. Delete → Trash → Delete forever.
    - Leave "Playwright kept event" in place for `verify`.
    - Keys N/J/K/G/? (C2), drag-to-create one range (C5), quick-add suggestion (C4).
    - Axe: week view (light and dark via `page.emulateMedia({ colorScheme })`), editor, shortcuts dialog, Trash view.
  - `mail.spec.ts`: open `/mail`, compose to `journey@solace.test`, send, wait for Inbox delivery, open and decrypt. Axe: inbox (light and dark), reader, composer.
  - `settings.spec.ts`: palette → Calendar Defaults → toggle Keyboard shortcuts off → reload → still off (sealed) and N is inert → toggle back on. Axe: settings panel.
  - `public-pages.spec.ts`: axe on `/privacy`, `/support` and `/licenses`.
- **Privacy:** traces, failure screenshots' raw output, page HTML and credentials stay under `private/`, never uploaded. CI uploads only `artifacts/web` (JUnit, JSON, axe summaries), plus failure PNGs copied from `private/playwright` after a test fails. They show only synthetic accounts.
- **CI:** a new `.github/workflows/web-e2e.yml` on `ubuntu-latest`, not a required check (like native E2E).
  - Paths: `apps/web/**`, `packages/**`, `apps/backend/**`, `crates/**`, `xtask/**`, `e2e/web/**`, `scripts/e2e/**`, `bun.lock`, `*.json`, `Cargo.*`, `.github/workflows/web-e2e.yml`.
  - Steps (reuse the pinned chainguard actions from `native-e2e-journeys.yml`):
    1. Set `SOLACE_E2E=1` and `SOLACE_E2E_DIR=$RUNNER_TEMP/solace-e2e`; checkout; Node, Bun; `bun install --frozen-lockfile`.
    2. apt podman/libssl; `rustup toolchain install`; rust-cache with `shared-key: web-e2e-${{ runner.os }}`.
    3. `cargo build -p xtask`; `services.py start`; `xtask e2e serve &`; `services.py wait-api`; `xtask e2e seed`.
    4. Build the web with the env above; `bunx playwright install --with-deps chromium`; `bun run test:e2e:web`.
    5. `xtask e2e verify calendar`; upload `artifacts/web` (`retention-days: 7`); `services.py stop` with `if: always()`.
  - `scripts/e2e/check_workflow.py` also lints `web-e2e.yml`.
**Changes.**
- Root `package.json`:
  - devDependencies `@playwright/test` (Apache-2.0) and `@axe-core/playwright` (MPL-2.0), both **exact** pins. The browser download version must match the pinned CLI.
  - Script `"test:e2e:web": "playwright test -c e2e/web/playwright.config.ts"`.
  - Commit `bun.lock`. `third-party-notices.json` does not change (not shipped).
- New `e2e/web/**` as above.
- `xtask/src/e2e.rs`: seed adds the invite and the fixture keys (`BROWSER_EMAIL`); verify's readable check covers `'Playwright%'` as well as `'Maestro%'`.
- `apps/web/lib/security-headers.ts`: loopback rule.
- New `.github/workflows/web-e2e.yml`; `scripts/e2e/check_workflow.py`.
- `e2e/README.md`: a "Web end-to-end tests" section (local run, coverage table, evidence policy).
**Compatibility.** Test-only, apart from the CSP condition, which never matches a production API URL. The native suite is unaffected beyond the extra invite row and fixture keys.
**Tests.**
- Extend `apps/web/__tests__/lib/security-headers.test.ts`: `upgrade-insecure-requests` is omitted for `http://localhost:4001` and `http://127.0.0.1:4001`, kept for `https://api.solace.onl` and for a non-loopback http host.
- Extend `xtask/src/e2e.rs` tests if seeding helpers change.
- The suite itself is the test.
**Docs.**
- §1 map, `e2e/` row: "Native Maestro journeys for both release apps (`e2e/native/`) and their Python harness …" → "Native Maestro journeys (`e2e/native/`), web Playwright journeys with axe scans (`e2e/web/`) and their harness …".
- §9 after the Native E2E paragraph, add: "Web E2E (`.github/workflows/web-e2e.yml`, `e2e/README.md`) serves the production web build on `localhost:4100` against the same disposable stack and fails on any serious or critical axe violation; traces stay under `private/`."
**Decisions.**
- Firefox and WebKit projects? **Default: Chromium only** for now; add when the motion rules need cross-browser proof.
- Pre-existing axe violations? **Default: fix them in this PR**, no baseline allowlist.
- Required check? **Default: no**, revisit after two weeks of stable runs.
