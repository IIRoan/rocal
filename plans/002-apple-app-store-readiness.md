# Apple App Store readiness

Started 2026-10-28 on `chore/apple-app-store-readiness`, based on `origin/master` at `ce72eea5`. This checklist covers both native apps. Checked items distinguish user-confirmed account information, repository setup, and live Expo verification; they do not establish installed-device readiness.

## 1. Membership and Expo identity

- [x] Apple Developer membership exists, confirmed by the owner.
- [x] Create a dedicated Apple-readiness branch.
- [x] Create `@astralgrove/solace-calendar` with matching dashboard name and slug; retain the existing `solace-mail` project.
- [x] Copy Calendar's project environment variable, including its development/preview/production assignments.
- [x] Link the existing signing material for four current iOS app/extension identifiers and the two current Android keystores, without rotating or revoking credentials.
- [x] Recreate Calendar's `development`, `preview`, `testing` and `master` branches/channels, preserving mapping logic and pause/protection settings.
- [x] Copy the four remote iOS/Android build-version counters for current production/development identifiers.
- [x] Update Calendar's config to the new project UUID/update endpoint and retain the legacy `exp+solace` development-client scheme alongside its canonical `solace-dev` scheme.
- [x] Label the old project `solace-calendar-legacy` and retain its published updates, build history and credentials during migration.
- [x] Make the shared native "Browse Expo updates" link use the current app's configured owner and slug.
- [x] Correct both native READMEs to describe the existing `appVersion` runtime policy and select existing Expo projects during setup.
- [x] Centralize both Expo identities/defaults in `packages/native-core/expo-apps.json` and derive app configuration in one shared builder.
- [x] Configure namespaced shared EAS service variables and remove repeated deployment URLs/DSNs from both build profiles and the OTA workflow.
- [x] Resolve runtime API/web/reporting values from the processed Expo config and derive publishing channels/environments from `eas.json`, including inherited testing settings.
- [x] Add an offline repository rule rejecting repeated native deployment env values and fixed Solace service URLs.
- [ ] Verify the corrected updates link in installed Calendar and Mail builds when testing the release candidate.

| App      | Expo dashboard display name | Immutable project slug | Existing project UUID                  | Native production ID  |
| -------- | --------------------------- | ---------------------- | -------------------------------------- | --------------------- |
| Calendar | `solace-calendar`           | `solace-calendar`      | `4262422c-3b37-44aa-9074-efe6d194eb12` | `onl.solace.calendar` |
| Mail     | `solace-mail`               | `solace-mail`          | `abe3e4a0-5b68-47b4-9390-654d95f093bd` | `onl.solace.mail`     |

Expo project slugs are immutable, so Calendar now uses a new project with the requested slug. The new update endpoint is `https://u.expo.dev/4262422c-3b37-44aa-9074-efe6d194eb12`. Device names remain `Solace Calendar` and `Solace Mail`; auth storage, native identifiers, App Groups and canonical deep-link schemes are unchanged. Development builds also accept older `exp+solace` links and generate `exp+solace-calendar` links. Mail keeps its existing project and native identities. [Expo project IDs](https://github.com/expo/fyi/blob/main/eas-project-id.md)

The old project is still `@astralgrove/solace`, UUID `1047b680-b99f-4671-9824-23b9a0487125`, displayed as `solace-calendar-legacy`. Installed binaries keep their embedded update endpoint until replaced by a new native build; an ordinary OTA cannot migrate that native setting. Existing build and update history remains in the old project and was not transferred to the new one. [EAS Update configuration](https://docs.expo.dev/eas-update/getting-started/)

### Complete the Calendar migration before deleting the old project

- [ ] Choose and build the replacement Calendar binary for the new project.
- [ ] Verify its archive uses the new project/update URL and the existing bundle/application identifier, signing identity, App Groups and keychain access.
- [ ] Install it over an existing current Calendar installation and verify login, encrypted data access, notifications, canonical deep links, legacy development links and update checks.
- [x] Confirm repository/CI configuration on the default branch points to the new project (PR #108 merged).
- [ ] After the shared configuration is in use on the default branch, remove obsolete project-scoped `EXPO_PUBLIC_API_URL` compatibility variables from Calendar and Mail; the new builder's EAS mode already uses only the shared `SOLACE_*` deployment values.
- [x] Save source/destination metadata, signing references, version counters, update-record IDs and a working-tree rollback patch in `/var/home/roan/Backups/solace/expo-project-migration/20261028T094712Z`.
- [ ] Archive the required old build/update artifacts for recovery before deleting the source project.
- [ ] After replacement installations are confirmed, delete only the old project UUID `1047b680-b99f-4671-9824-23b9a0487125` and verify remote completion without revoking shared signing material or changing Mail.

## 2. Apple app records and EAS credentials

- [ ] Verify the intended Apple developer team and publisher identity.
- [ ] Create or verify separate App Store Connect app records for `onl.solace.calendar` and `onl.solace.mail`.
- [ ] Set each app's `submit.production.ios.ascAppId` in its `eas.json` once its App Store Connect app ID is known.
- [ ] Configure EAS-managed submission credentials and production distribution profiles.
- [ ] Verify signing for both main apps and their `.NotificationService` extensions, App Groups, push notifications and associated domains.
- [ ] Complete required Apple agreements, age ratings, launch territories and EU trader declarations.

Existing production build and submission scripts are in both apps' `package.json`; both `submit.production` profiles currently contain `{}`. EAS can manage signing and uploads from Linux. [EAS Submit](https://docs.expo.dev/submit/ios/)

Live EAS inspection on 2026-10-28 found stored credentials for the current main-app and extension identifiers under team `HXJACWP87H`. The current Calendar references were copied to the new project; those four identifiers currently have ad-hoc profiles, so App Store distribution profiles still need setup. Neither new Calendar nor Mail has an App Store Connect app connection or a submission API key assigned to its iOS credentials. This does not establish whether app records already exist in Apple's dashboard or whether stored signing credentials are still valid. The old Calendar project also has legacy `onl.solace.mobile` credential records; these were retained there. Its latest cloud build records use that older identifier; the new Calendar project and Mail had no cloud build records at migration preparation, which does not establish the state of CI-local builds.

## 3. Privacy and support

- [x] Expand `apps/web/app/privacy/page.tsx` with source-verified retention/deletion windows and provider information; private contact remains pending below.
- [x] Add accessible privacy-policy and support links to both native apps through shared App settings and signed-out native auth screens, plus web account settings and public navigation.
- [x] Implement a public `/support` page with account/recovery/deletion help and public bug reporting; derive both native links from the build’s configured website.
- [ ] Confirm a private support/privacy contact address, set `supportEmail` once in `packages/calendar-core/src/product-info.json`, deploy the pages, and verify the links from the signed-out web and installed apps.
- [x] Prepare the source-based data-processing inventory below for both apps.
- [ ] Confirm App Privacy classifications against the release archives, deployed providers and Apple’s definitions, and complete both app records.
- [x] Add explicit no-tracking manifests for both main apps and the shared notification extension, retain SDK reason aggregation, and add automated archive manifest inspection.
- [ ] Inspect the real signed archives and required API reasons, including SDK coverage and whether each declared reason matches actual use.
- [ ] Determine export-compliance requirements for the actual E2EE libraries and launch territories; document the basis for any exemption and supply required documents.

Both app configs currently set `ITSAppUsesNonExemptEncryption: false`; source inspection alone does not establish whether that declaration is correct. Account deletion already exists in shared native settings and the Rust API; validate it rather than introducing a second deletion flow. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Apple encryption declarations](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

## 4. Production release controls

- [x] Gate production OTA publishing behind successful native checks and an explicit default-branch release dispatch; default-branch pushes now publish only preview updates.
- [x] Share build/update routing: trusted PRs use development, testing-branch pushes use testing, and default-branch pushes use preview. Profile channels and environments come from `eas.json`.
- [x] Add matching testing internal artifacts and a separate store-distribution TestFlight profile on the testing channel; keep production's existing master channel for binary compatibility.
- [x] Document native-dependency/plugin changes requiring an app-version bump and new binary under the existing `appVersion` policy (below and both native READMEs).
- [x] Validate the exact build archive before optional TestFlight submission; record the EAS build ID/source commit and publish a sanitized validation report.
- [ ] Test OTA installation, deferred installation and rollback on compatible release binaries.
- [ ] Confirm production EAS environment values and production API/passkey origins.
- [x] Retain internal development/preview builds, add testing, and provide a separate manually dispatched iOS App Store workflow with optional TestFlight submission and App Store Connect ID preflight.

## 5. Reviewer access and onboarding

- [ ] Prepare a dedicated reviewer account through a normally accepted invite, with mailbox provisioning and E2EE setup completed.
- [x] Prepare a synthetic calendar fixture and review walkthrough below, with sample mail instructions that use the normal send flow.
- [ ] Load the samples into the dedicated reviewer account and verify its credentials with the selected binaries.
- [ ] Ensure reviewer access does not depend on the operator's personal passkey or device.
- [x] Explain invite-only onboarding and the relationship between Calendar and Mail in draft review notes and separate listing copy; verify the final App Store Connect notes before submission.
- [ ] Confirm backend and support availability throughout review.

Native signup currently requires an invite, and Mail provisioning requires mailbox approval. Native login uses first-party email/password with passkey step-up; adding Sign in with Apple is conditional on future login choices. No native purchase integration was found in the initial audit; payment/IAP work is conditional on the launch business model. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 6. Verification and TestFlight

- [x] Pass local repository lint, both root TypeScript checks, relevant tests and the full required Rust check for this follow-up; CI and installed-device evidence are separate.
- [x] Align both apps/native-core and root overrides with Expo SDK 57 patch recommendations (Expo 57.0.31, RN 0.86.3) and pass dependency compatibility checks.
- [x] Pass Expo Doctor for both apps (21/21 checks each); generated archives and installed binaries still need validation.
- [x] Verify the selected `sdk-57` image is currently Xcode 26.6 and add an archive gate for Apple’s current minimum Xcode 26/iOS SDK 26.
- [ ] Record the actual build image/SDK for each release and recheck Apple’s requirements before submission.
- [ ] Build each app's production/store profile with `bun run build:ios` from its app directory.
- [ ] Inspect signed identities, matching extension versions, entitlements and privacy manifests in the archives.
- [ ] Upload the selected production builds with `bun run submit:ios`, recording each exact build ID and source commit.
- [ ] Configure internal TestFlight testers; complete Beta App Review before distributing to external testers where required.

Existing development/preview profiles use `distribution: internal`; their QR/ad-hoc IPAs do not substitute for store-signed TestFlight builds. [Expo TestFlight](https://docs.expo.dev/submit/testflight/), [Apple build requirements](https://developer.apple.com/news/upcoming-requirements/)

`testing` is an internal build on channel `testing`; `testflight` inherits production's store distribution and version increment while using the same testing channel and preview environment. The iOS App Store workflow selects `testflight` or `production` from the default branch; both use `submit.production` for an optional upload. Production's embedded update channel remains `master`. No automatic default-branch job publishes a production update. [Expo deployment channels](https://docs.expo.dev/eas-update/deployment/)

## 7. Installed-device acceptance

- [ ] Test both apps on iPhone and iPad, including the minimum supported iOS version and a current version; both configs currently enable iPad support and target iOS 16.4 or later.
- [ ] Verify fresh install, signup, sign-in, session renewal, password reset, encryption unlock/recovery, offline startup, sign-out and account switching.
- [ ] Verify account deletion using disposable accounts, including mailbox/avatar deletion and local cache/keychain cleanup.
- [ ] Verify Calendar event CRUD, recurrence, timezones, invitations and reminders.
- [ ] Verify Mail send/receive, attachments, search and offline restoration.
- [ ] Verify Mail-to-Calendar deep links with Calendar installed and absent.
- [ ] Verify notification delivery, decrypted previews and taps while foregrounded, backgrounded, locked and terminated.
- [ ] Verify denied permissions, icons/splash screens, keyboard/sheet behavior, VoiceOver, larger text, light/dark themes and reduced motion.
- [ ] Record the tested binary IDs and any OTA versions used; automated tests do not establish these device results.

## 8. Listings, review and launch

- [x] Prepare separate names, subtitles, descriptions, keywords and configured support/privacy URLs as EAS Metadata drafts from shared identity/listing/product files.
- [ ] Confirm publisher/copyright, primary/secondary categories, age ratings and launch territories; capture the required iPhone/iPad screenshots with synthetic data.
- [x] Generate reviewable `store.config.draft.json` files in the store workflow without pushing metadata or defaulting legal/age-rating answers.
- [ ] Review the generated metadata and publish approved listing fields through EAS Metadata or App Store Connect; finish unsupported fields/screenshots in App Store Connect.
- [ ] Select the exact tested builds, complete declarations and reviewer instructions, and submit both apps for App Review.
- [ ] Resolve review feedback and choose the public release timing.
- [ ] Verify public downloads, login, notifications, support access and error reporting after release.

EAS Submit uploads a binary; public App Review and release remain separate App Store Connect steps. EAS Metadata is optional and currently beta. [EAS Submit](https://docs.expo.dev/submit/ios/), [EAS Metadata](https://docs.expo.dev/eas/metadata/)

## Release preparation added after PR #108

This follow-up implements repository work on `feat/apple-readiness-privacy-and-release-checks`. Checkmarks for pages, manifests, tooling and drafts mean implementation exists. They do not mean those pages are deployed, an archive has passed Apple's processing, or a reviewer account/device has been tested.

### Shared inputs and native runtime

- Expo identity, native version and extension target settings: `packages/native-core/expo-apps.json`.
- Public support/privacy routes and optional private contact: `packages/calendar-core/src/product-info.json`. The public website origin comes from the selected EAS environment's `SOLACE_APP_URL`; listings and in-app links derive from it. The contact address is intentionally unset until confirmed by the owner.
- Separate Calendar/Mail subtitle, description and keyword drafts: `packages/native-core/store-listings.json`.

The shared native version is now `1.0.1` because privacy-manifest/plugin changes and Expo/RN patch alignment affect the native archive. With the `appVersion` runtime policy, changes to SDK/RN versions, native dependencies, config plugins, entitlements, permissions, app extensions or embedded configuration require a version bump in the shared settings and a new binary for each affected app. Pure JS/assets may use OTA only within a compatible runtime. Never force a new native bundle onto an older runtime with `EAS_UPDATE_RUNTIME_VERSION`; old runtime binaries keep their existing compatible updates. Rebuild and test TestFlight first, then build/test the production channel; keep the exact prior compatible update/build references for rollback.

### Signed archive gate and metadata drafts

Dispatch **iOS App Store build** from the default branch with `testflight` or `production`. It builds without auto-submit, records one exact EAS build ID/source commit, and uses a macOS job to download and verify that archive. Optional submission uses that same build ID only after verification. Uploaded reports contain selected public release fields, without raw EAS environment/configuration, provisioning contents, tokens or signed artifact-download URLs.

The gate checks the main/extension SDK and Xcode minimums, bundle IDs and matching versions/build numbers; embedded EAS project URL, runtime and channel; explicit app/extension no-tracking manifests and required-reason declaration syntax; code-signature integrity; matching signing teams/App Groups; unexpired profiles; store distribution without ad-hoc devices, enterprise or debug entitlements; production APNs; and configured associated domains. It does not prove privacy-reason completeness, provider behavior, export compliance, Apple account ownership, future changes to Apple’s SDK requirements or actual device behavior. A real signed archive run remains pending.

For a local archive, use the same expectation file generated by the selected profile:

```bash
cd apps/native-calendar # or apps/native-mail
umask 077
eas config --platform ios --profile testflight --json > /tmp/solace-eas-config.json
python3 ../../scripts/ios-release.py prepare --app calendar --eas-config /tmp/solace-eas-config.json --out-dir /tmp/solace-release
python3 ../../scripts/ios-release.py verify --ipa /path/to/selected.ipa --expectations /tmp/solace-release/archive-expectations.json --report /tmp/solace-release/archive-validation.json --require-signature
```

Use `--app mail` for Mail. Signature verification requires macOS; structural inspection without `--require-signature` must not be presented as a signed-release pass. Keep the raw config private and remove it afterward. Build IDs/source commits in workflow artifacts identify what was checked.

As checked on 2026-10-28, Apple requires Xcode 26 and iOS/iPadOS SDK 26 or later for uploads. Expo’s `sdk-57` image currently selects `macos-tahoe-26.5-xcode-26.6`; keep this SDK-specific alias rather than switching to `latest`, whose Xcode 27 images have different scene-lifecycle requirements. The verified minimums/date live once in `expo-apps.json` under `iosStoreRequirements`, and the archive report records the actual SDK/Xcode. Recheck these before every release. [Apple upload requirements](https://developer.apple.com/news/upcoming-requirements/), [Expo images](https://docs.expo.dev/build-reference/infrastructure/)

The workflow also produces an EAS Metadata `store.config.draft.json` for the app/version/environment. Review its URLs and copy, supply the owner-approved publisher/copyright, categories, age ratings and any other required declarations, and configure `submit.production.ios.metadataPath` to an approved file before using `eas metadata:push --profile production`. The draft is not pushed automatically and deliberately omits age-rating defaults. Verify public URLs after deployment and before submission. [EAS Metadata configuration](https://docs.expo.dev/eas/metadata/config/)

### App Privacy data inventory for owner review

These are source findings and candidate disclosure areas, not finalized Apple questionnaire answers. Review Apple's definitions for collection, optional disclosure and linkage, including hosting/delivery providers and diagnostics. Encryption by itself does not settle whether information is collected. No advertising, tracking or session-replay SDK is permitted by repository rules. [Apple App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)

| Processing area            | Data and purpose                                                                                                                                                                                                                                                                         | Scope / release verification                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account and authentication | Email, display name, opaque account IDs, authentication credentials/session records, invite and security state operate the account. Avatar uploads are re-encoded and stored privately, without E2EE.                                                                                    | Both apps; examine contact info, user identifiers and user-content disclosures. Confirm account-linked fields and the live deletion flow.                                     |
| Calendar                   | Titles/descriptions/locations and calendar/category names are encrypted client-side; scheduling/sharing metadata and participant addresses remain readable. Subscription feeds and invitation delivery have separate readable-content limits.                                            | Calendar and shared account services; verify public/subscribed/shared/invitation flows and the privacy page's existing encryption exceptions.                                 |
| Mail                       | Messages, attachments, addresses, contacts and mailbox metadata support send/receive, storage and search. Normal email is readable during ordinary delivery; encrypted storage/OpenPGP do not make every mail flow E2EE. Known backend token/ingestion gaps remain documented in AGENTS. | Mail; assess emails/text messages, contacts and other content. Confirm the deployed vault/delivery behavior and on-device search boundaries.                                  |
| Push and extension         | APNs token, opaque bundle/device/event/mail identifiers, delivery preference/job metadata and encrypted reminder title. The extension decrypts/fetches previews on-device and currently holds the session cookie in shared keychain.                                                     | Calendar reminders / Mail new-mail alerts; inspect payloads and verify locked-device fallback, sign-out cleanup and the outstanding scoped-token gap.                         |
| Diagnostics                | Self-hosted Errex receives scrubbed error events/breadcrumbs without default PII; no third-party analytics. API logs use categories and request IDs.                                                                                                                                     | Both apps; inspect crash/diagnostic fields from actual archives and the deployed retention/configuration rather than assuming scrubbing removes every disclosure requirement. |
| Hosting and delivery       | Railway operates API/database/mail/notification/avatar infrastructure; Vercel serves web and passkey bridge; Expo provides builds/OTA; Apple delivers APNs. Providers receive necessary connection metadata.                                                                             | Confirm provider contracts, regions, operational logs/backups and actual retention; account sessions themselves do not retain IP/user-agent metadata.                         |
| Local device data          | Secure-store/keychain auth and keys, encrypted Mail snapshot and optional encrypted search index; no persistent query cache. Photo permission is used for a selected avatar; camera/microphone permission is disabled.                                                                   | Both apps; confirm sign-out/account-switch deletion and permission strings in the built archive. Local-only processing and server transfers need separate review.             |

Retention source: `apps/notifications/src/retention.rs`; account deletion: `apps/backend/src/account/{service,queries}.rs`; payload/log scrubbing: shared `redaction-policy.js` and client report-redaction helpers. The public policy lists live cleanup eligibility windows and does not promise unverified backup purge times. Confirm a private contact route before declaring privacy/support readiness complete.

### Privacy-manifest and encryption evidence

The shared app config explicitly sets `NSPrivacyTracking: false` with no tracking domains. React Native/Expo retain their default SDK manifest aggregation. Source manifests in React Native and Expo FileSystem declare required reasons such as UserDefaults, file timestamps and disk space; the archive report enumerates included declared families. The Swift notification extension uses CryptoKit, Security/keychain, ephemeral URLSession and UserNotifications; this source inspection found no direct UserDefaults, disk-space, boot-time or file-timestamp API call to assign an extension-specific required reason. Do not add arbitrary reason codes to make validation pass. Compare the actual binary/SDK inventory with Apple's approved reasons, and use Xcode's privacy report to review collection declarations and SDK coverage. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/)

For the export-compliance determination, inventory at least `packages/e2ee` (AES-GCM-256, RSA-OAEP-4096, HMAC-SHA-256), native `react-native-quick-crypto`, Argon2id and OpenPGP usage, HTTPS transport and the CryptoKit notification extension. Record which functions are implemented by the OS versus bundled libraries, the distribution territories, the applicable exemption basis and any required filing/Apple documents. The existing `ITSAppUsesNonExemptEncryption: false` is not evidence that this assessment has happened. Set the final declaration and any Apple-provided compliance code in the shared app builder after the determination; update the runtime if native configuration changes. [Apple export-compliance process](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

### Reviewer setup and walkthrough draft

1. Use the normal invite flow to create a dedicated non-personal review account. Accept the invite, complete authentication/E2EE setup, and let Mail provision its mailbox normally; do not bypass invite approval or insert account records manually.
2. Confirm fresh-device email/password login and encrypted-data unlock without an operator's personal passkey. Supply the necessary credentials/unlock instructions privately in App Store Connect review information, never in this repository, screenshots, CI artifacts or public issues. Keep the account usable throughout review.
3. Import `plans/fixtures/apple-review-calendar.ics` through Calendar's **Import an .ics file** flow into a synthetic calendar. Navigate to January 2030; edit/move the planning event and inspect the four weekly check-ins. Also create a current-day event with a near-future reminder to exercise notification delivery.
4. In Mail, send a message to the review account's own actual mailbox with subject `Welcome to the sample inbox` and a plain synthetic body. Reply with `Sample reply for App Review`; add a small synthetic text attachment and a label. Use the regular send flow and confirm delivery, threading, attachment access, on-device search and offline reopening. The fixtures contain no real addresses or user data.
5. Verify Calendar creation/edit/recurrence/invites and Mail send/receive/attachments. Test the Mail-to-Calendar event link with Calendar installed and absent. Open **Account → App → Help and privacy** in each native app and the web account help links; confirm they reach the configured public site.
6. Test deletion with a separate disposable invited account so the review credentials remain available. Record exact binary build IDs, source commit, runtime/channel, device/OS and results. Capture the listing screenshots from the synthetic data only.

Draft reviewer explanation: “Solace currently uses invitation-only account creation. The review account is already activated with its mailbox and encryption setup complete. Calendar and Mail are separate apps using the same account, and each can be reviewed independently; Mail can open event details in Calendar. Account deletion is available in Account settings. The public support and privacy links are available in App settings. Credentials, encryption-unlock instructions and any additional security steps are supplied privately in this review record.” Replace this draft with the exact tested account steps before submitting; do not claim setup is complete until verified.

## Preparation validation

- The full native suites passed during configuration preparation: native-core had 48 suites and 372 tests, Calendar had 43 suites and 491 tests, and Mail had 50 suites and 362 tests. Subsequent release-routing checks pass 47 Calendar tests and nine Mail artifact tests, including default-branch production restrictions, TestFlight profile inheritance and refusal of routing-override flags. Subprocess tests replace EAS with a local stub and never publish.
- Native-core, Calendar and Mail TypeScript checks pass.
- ESLint reports no findings in changed source files; native-core's full lint run exits successfully with seven warnings in unchanged files. Actionlint, including ShellCheck, passes for the build, update, App Store and reusable validation workflows.
- Repository checks pass for changed source files, and the new deployment-configuration rule passes across the full repository. React Doctor reports no issues; Mail's full component/hook compilation check passes with the shipped React Compiler.
- Fresh-process evaluation of all six Expo configurations matches the pre-centralization native settings exactly after excluding the new public runtime-environment metadata. Extension target names and bundle IDs agree with the shared settings. The earlier migration comparison separately verified Calendar's intended slug/project/update URL changes and its retained development scheme.
- Live `eas config` checks for Calendar preview and Mail production resolve the configured project, API/web/reporting values and passkey domains. A read-only `eas env:exec` check successfully loads the shared environment and runs the same validation used before builds/updates.
- Live `eas config` checks confirm both new TestFlight profiles resolve store distribution, the testing channel, the preview environment and the intended production bundle IDs. All four current channels in each project are mapped to their intended branches; their existing pause/protection states were retained.
- Live Expo reads verify reuse of signing references, matching channel rules/protection settings, copied version counters and inheritance of shared deployment variables by both apps. The old project remains available; build, installed-device and retirement evidence is tracked above.

### Follow-up validation

- The full native suites pass after SDK patch alignment: native-core 49 suites / 380 tests; Calendar 44 / 511; Mail 50 / 362. The eight public-information/navigation tests, nine shared link tests, four native auth/settings link tests, and full web React Compiler check pass.
- Eleven iOS release-tool tests pass, including mutated archives, old SDK/Xcode, wrong runtime/channel/identity, tracking/missing manifests, unsafe ZIP paths, signature-required behavior, provisioning errors, exact build selection and a real Xcode-project plugin rerun. Actual macOS code signing and a real signed archive remain untested locally.
- Repository lint, both root TypeScript checks, workflow Actionlint/ShellCheck and frozen installation with pinned Bun 1.4.4 pass. Existing lint warnings are outside the changed files. An additional standalone calendar-core typecheck fails on existing test fixtures; the same errors reproduce from `origin/master` in an isolated source snapshot, while the changed link module/tests pass strict checking.
- Expo dependency checks and Expo Doctor (21/21 each) pass for both apps. Doctor initially found two local copies of the same expo-font version; removing the stale nested copy and reinstalling from the frozen lockfile resolved it without a lockfile change. Live read-only EAS config resolves the intended Calendar TestFlight and Mail production identities/channels and runtime 1.0.1.
- No manual native build, OTA publish, metadata push, App Store Connect mutation, web deployment or installed-device test was performed for this follow-up. Store credentials/app IDs, private contact, declarations, reviewer account setup and TestFlight/device evidence remain pending above.

- The full `cargo xtask check` passes, including formatting, Clippy, unit tests, all 439 API cases in both development and production after integrating the updated master, code generation/destination checks and release memory budgets. Earlier local runs failed in mail-delivery integration cases; recreating only the disposable test Stalwart container restored the complete run without changing backend code or tests.

- Guardener rejects the default branch’s unsupported `key.data` entries with empty-host/unknown-signer errors. The follow-up uses the documented `key.kms` URLs for the owner’s published GitHub GPG keyring and GitHub’s web-flow key; the signed commit verifies against that downloaded keyring. Guardener reads default-branch policy, so remote enforcement must be rechecked after the correction is merged. GitHub’s separate commit-verification badge reports `bad_email` for the existing key/author identity; no signing keys or account identities were changed. [Guardener commit verification](https://edu.chainguard.dev/chainguard/guardener/github/commit-verification/), [policy activation](https://edu.chainguard.dev/chainguard/guardener/github/configuration/)
