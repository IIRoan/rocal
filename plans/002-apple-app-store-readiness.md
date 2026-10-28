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
- [ ] Verify the corrected updates link in installed Calendar and Mail development builds; store builds hide it with the other debugging tools.

| App      | Expo dashboard display name | Immutable project slug | Existing project UUID                  | Native production ID  |
| -------- | --------------------------- | ---------------------- | -------------------------------------- | --------------------- |
| Calendar | `solace-calendar`           | `solace-calendar`      | `4262422c-3b37-44aa-9074-efe6d194eb12` | `onl.solace.calendar` |
| Mail     | `solace-mail`               | `solace-mail`          | `abe3e4a0-5b68-47b4-9390-654d95f093bd` | `onl.solace.mail`     |

Expo project slugs are immutable, so Calendar now uses a new project with the requested slug. The new update endpoint is `https://u.expo.dev/4262422c-3b37-44aa-9074-efe6d194eb12`. Device names remain `Solace Calendar` and `Solace Mail`; auth storage, native identifiers, App Groups and canonical deep-link schemes are unchanged. Development builds also accept older `exp+solace` links and generate `exp+solace-calendar` links. Mail keeps its existing project and native identities. [Expo project IDs](https://github.com/expo/fyi/blob/main/eas-project-id.md)

The old project is still `@astralgrove/solace`, UUID `1047b680-b99f-4671-9824-23b9a0487125`, displayed as `solace-calendar-legacy`. Installed binaries keep their embedded update endpoint until replaced by a new native build; an ordinary OTA cannot migrate that native setting. Existing build and update history remains in the old project and was not transferred to the new one. [EAS Update configuration](https://docs.expo.dev/eas-update/getting-started/)

### Complete the Calendar migration before deleting the old project

- [x] Build a replacement Calendar store binary for the new project: TestFlight build `4110cc4a-b317-4fb9-9f32-6c06211fee36` finished successfully. Installation/migration acceptance remains pending below.
- [ ] Verify its archive uses the new project/update URL and the existing bundle/application identifier, signing identity, App Groups and keychain access.
- [ ] Install it over an existing current Calendar installation and verify login, encrypted data access, notifications, canonical deep links, legacy development links and update checks.
- [x] Confirm repository/CI configuration on the default branch points to the new project (PR #108 merged).
- [x] After PR #108 merged, back up and remove obsolete project-scoped `EXPO_PUBLIC_API_URL` variables from the two current projects. Live readback confirms shared `SOLACE_*` inheritance; the legacy Calendar project is untouched.
- [x] Save source/destination metadata, signing references, version counters, update-record IDs and a working-tree rollback patch in `/var/home/roan/Backups/solace/expo-project-migration/20261028T094712Z`.
- [ ] Archive the required old build/update artifacts for recovery before deleting the source project.
- [ ] After replacement installations are confirmed, delete only the old project UUID `1047b680-b99f-4671-9824-23b9a0487125` and verify remote completion without revoking shared signing material or changing Mail.

## 2. Apple app records and EAS credentials

- [ ] Verify the intended Apple developer team and publisher identity.
- [x] Create or verify separate App Store Connect app records for `onl.solace.calendar` (Apple ID `6828036308`) and `onl.solace.mail` (`6828036995`).
- [x] Set each app's `submit.production.ios.ascAppId` in its `eas.json`.
- [x] Provision App Store distribution profiles/certificates for both main apps and their notification extensions; verified through EAS after the owner’s interactive setup.
- [ ] Configure EAS-managed submission credentials/API keys and link the App Store Connect app records.
- [ ] Verify signing for both main apps and their `.NotificationService` extensions, App Groups, push notifications and associated domains.
- [ ] Complete required Apple agreements, age ratings, launch territories and EU trader declarations.

Existing production build and submission scripts are in both apps' `package.json`; both `submit.production` profiles name their App Store Connect app. EAS can manage signing and uploads from Linux. [EAS Submit](https://docs.expo.dev/submit/ios/)

Live EAS inspection on 2026-10-28 found stored credentials for the current main-app and extension identifiers under team `HXJACWP87H`. The current Calendar references were copied to the new project; the initial snapshot had only ad-hoc profiles. After the owner’s interactive setup, both apps and their notification extensions also have App Store profiles. Neither new Calendar nor Mail has an App Store Connect app connection or a submission API key assigned to its iOS credentials. This does not establish whether app records already exist in Apple's dashboard or whether stored signing credentials are still valid. The old Calendar project also has legacy `onl.solace.mobile` credential records; these were retained there. Its latest cloud build records use that older identifier; the new Calendar project and Mail had no cloud build records at migration preparation, which does not establish the state of CI-local builds.

## 3. Privacy and support

- [x] Expand `apps/web/app/privacy/page.tsx` with source-verified retention/deletion windows and provider information, using the shared support contact.
- [x] Add accessible privacy-policy and support links to both native apps through shared App settings and signed-out native auth screens, plus web account settings and public navigation.
- [x] Implement a public `/support` page with account/recovery/deletion help and public bug reporting; derive both native links from the build’s configured website.
- [x] Confirm `support@solace.onl` with the owner and set `supportEmail` once in `packages/calendar-core/src/product-info.json`.
- [x] Provision the support address as an enabled alias on the owner’s existing mailbox. Verify admin readback and public SMTP recipient acceptance (250), resetting without sending a message; save private before/after metadata and a rollback patch outside Git.
- [ ] Deploy the public pages and verify support/privacy links from signed-out web and installed apps.
- [x] Prepare the source-based data-processing inventory below for both apps.
- [ ] Confirm App Privacy classifications against the release archives, deployed providers and Apple’s definitions, and publish both app records. Answers are entered but unpublished in both records: contact info, user ID, device ID (push token), photos (avatar), other user content and, for Mail, emails are linked to the user and used only for app functionality; nothing is used for tracking. Error reporting was removed, so neither app declares diagnostics.
- [x] Add explicit no-tracking manifests for both main apps and the shared notification extension, retain Expo/React Native SDK reason aggregation, and test the extension plugin against a generated Xcode project.
- [ ] Inspect the real signed archives and required API reasons, including SDK coverage and whether each declared reason matches actual use.
- [x] Remove camera and microphone access code from the iOS binaries: `patches/expo-image-picker@57.0.20.patch` strips the unused camera APIs, and `scripts/tests/ios-no-camera.cjs` fails CI if any native dependency references them (Apple rejects such code without a purpose string).
- [x] Show the Debugging settings, their search entries and the Expo updates link only in development builds (`SHOW_DEBUG_TOOLS` in native-core `lib/constants.ts`), so TestFlight and App Store builds carry no developer tools.
- [ ] Determine export-compliance requirements for the actual E2EE libraries and launch territories; document the basis for any exemption and supply required documents.

Both apps conservatively declare non-exempt encryption (`ITSAppUsesNonExemptEncryption: true`) pending the owner’s Apple questionnaire and territory/filing determination. This setting does not establish that export compliance is complete. Account deletion already exists in shared native settings and the Rust API; validate it rather than introducing a second deletion flow. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Apple encryption declarations](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

## 4. Production release controls

- [x] Gate production OTA publishing behind successful native checks and an explicit default-branch release dispatch; default-branch pushes now publish only preview updates.
- [x] Share build/update routing: trusted PRs use development, testing-branch pushes use testing, and default-branch pushes use preview. Profile channels and environments come from `eas.json`.
- [x] Add matching testing internal artifacts and a separate store-distribution TestFlight profile on the testing channel; keep production's existing master channel for binary compatibility.
- [x] Document native-dependency/plugin changes requiring an app-version bump and new binary under the existing `appVersion` policy (below and both native READMEs).
- [x] Let EAS manage signing/build/upload; check the completed build’s project, identifier, profile, channel, version and source commit before submitting that exact build ID. Retain a sanitized reference and listing draft.
- [ ] Test OTA installation, deferred installation and rollback on compatible release binaries.
- [x] Confirm live EAS service values resolve the production API and website and `webcredentials` origin for both store profiles. API health is 200.
- [x] Implement the public passkey-association route from shared bundle identifiers and an environment-specific `SOLACE_APPLE_TEAM_ID`; return 404 when the team is absent/invalid.
- [ ] Deploy and verify the website’s passkey association file; its configured `/.well-known/apple-app-site-association` URL returned 404 during preparation. Verify associated-domain authorization using the actual Apple team and both app IDs before device testing.
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
- [x] Verify the selected `sdk-57` image currently meets Apple’s Xcode 26/iOS SDK 26 upload requirements; keep actual archive processing and device checks pending.
- [ ] Record the actual build image/SDK for each release and recheck Apple’s requirements before submission.
- [ ] Build each app's production/store profile with `bun run build:ios` from its app directory.
- [ ] Inspect signed identities, matching extension versions, entitlements and privacy manifests in the archives.
- [ ] Upload the selected production builds with `bun run submit:ios`, recording each exact build ID and source commit.
- [ ] Configure internal TestFlight testers; complete Beta App Review before distributing to external testers where required.

Existing development/preview profiles use `distribution: internal`; their QR/ad-hoc IPAs do not substitute for store-signed TestFlight builds. [Expo TestFlight](https://docs.expo.dev/submit/testflight/), [Apple build requirements](https://developer.apple.com/news/upcoming-requirements/)

`testing` is an internal build on channel `testing`; `testflight` inherits production's store distribution and version increment while using the same testing channel and preview environment. The iOS App Store workflow selects `testflight` or `production` from the default branch; both use `submit.production` for an optional upload. Production's embedded update channel remains `master`. No automatic default-branch job publishes a production update. [Expo deployment channels](https://docs.expo.dev/eas-update/deployment/)

## 7. Installed-device acceptance

- [x] Configure both main apps and notification extensions for iPhone only, as confirmed by the owner; target iOS 16.4 or later.
- [ ] Test both apps on iPhone, including the minimum supported iOS version and a current version.
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
- [ ] Confirm publisher/copyright, primary/secondary categories, age ratings and launch territories; capture the required iPhone screenshots with synthetic data.
- [x] Generate reviewable `store.config.draft.json` files in the store workflow without pushing metadata or defaulting legal/age-rating answers.
- [ ] Review the generated metadata and publish approved listing fields through EAS Metadata or App Store Connect; finish unsupported fields/screenshots in App Store Connect.
- [ ] Select the exact tested builds, complete declarations and reviewer instructions, and submit both apps for App Review.
- [ ] Resolve review feedback and choose the public release timing.
- [ ] Verify public downloads, login, notifications, and support access after release.

EAS Submit uploads a binary; public App Review and release remain separate App Store Connect steps. EAS Metadata is optional and currently beta. [EAS Submit](https://docs.expo.dev/submit/ios/), [EAS Metadata](https://docs.expo.dev/eas/metadata/)

## Release preparation added after PR #108

This follow-up implements repository work on `feat/apple-readiness-privacy-and-release-checks`. Checkmarks for pages, manifests, tooling and drafts mean implementation exists. They do not mean those pages are deployed, an archive has passed Apple's processing, or a reviewer account/device has been tested.

### Shared inputs and native runtime

- Expo identity, native version and extension target settings: `packages/native-core/expo-apps.json`.
- Public support/privacy routes and contact: `packages/calendar-core/src/product-info.json`. The public website origin comes from the selected EAS environment's `SOLACE_APP_URL`; listings and in-app links derive from it. The owner approved `support@solace.onl`; receiving-account routing is operational state and stays outside Git.
- Separate Calendar/Mail subtitle, description and keyword drafts: `packages/native-core/store-listings.json`.

The shared native version is now `1.0.2`: earlier PR CI already built development binaries on `1.0.1`, so the later iPhone-only/encryption native configuration receives a separate runtime. Privacy-manifest/plugin changes and Expo/RN patch alignment also require new native archives. With the `appVersion` runtime policy, changes to SDK/RN versions, native dependencies, config plugins, entitlements, permissions, app extensions or embedded configuration require a version bump in the shared settings and a new binary for each affected app. Pure JS/assets may use OTA only within a compatible runtime. Never force a new native bundle onto an older runtime with `EAS_UPDATE_RUNTIME_VERSION`; old runtime binaries keep their existing compatible updates. Rebuild and test TestFlight first, then build/test the production channel; keep the exact prior compatible update/build references for rollback.

### EAS builds, submission and metadata drafts

Dispatch **iOS App Store build** from the default branch with `testflight` or `production`. Native checks run before EAS builds the signed app. A small Bun helper checks EAS’s completed build metadata against the selected app/profile/channel/version/source commit. Optional `eas submit --id` uploads that same build. The workflow retains public release fields and a listing draft; it excludes raw environment/configuration, credentials and signed artifact URLs.

EAS owns certificate/profile management, the native build and upload. Apple processes the archive and reports upload issues. This workflow does not download/unzip IPAs or reimplement code-signature, provisioning or SDK validation. Review EAS build logs and Apple’s processing results, verify privacy/API reasons using the release archive, and perform the installed-device acceptance above. Upload success does not establish export compliance, metadata approval, device behavior or public App Review. [EAS Build](https://docs.expo.dev/build/introduction/), [EAS Submit](https://docs.expo.dev/submit/ios/)

The shared runtime is `1.0.2`; no store binary for it has been verified. Earlier `1.0.0` installations keep their compatible OTA history until replaced. Before the first build, authenticate interactively from each app directory:

```bash
eas credentials:configure-build --platform ios --profile testflight
eas credentials --platform ios
```

Reuse valid distribution certificates, configure App Store profiles for the app and notification extension, and assign an App Store Connect API key for non-interactive submission. Set each app’s actual Apple ID in `submit.production.ios.ascAppId`; never guess it from its bundle ID. The cached Apple session was expired during preparation, so account setup is pending authentication by the owner.

As checked on 2026-10-28, Apple requires Xcode 26 and iOS SDK 26 or later for uploads. Expo’s `sdk-57` image selects Xcode 26.6. Keep the SDK-specific alias and recheck Expo’s image and Apple’s current requirements before release, using build logs and Apple processing as release evidence. [Apple upload requirements](https://developer.apple.com/news/upcoming-requirements/), [Expo images](https://docs.expo.dev/build-reference/infrastructure/)

The workflow generates EAS Metadata `store.config.draft.json` from shared identities/listing copy and the selected environment’s website. Review its URLs and copy, supply publisher/copyright, categories, age ratings and other required declarations, and set `submit.production.ios.metadataPath` to an approved file before `eas metadata:push --profile production`. The draft is not pushed automatically and omits age-rating defaults. Verify public support/privacy URLs after deployment. [EAS Metadata configuration](https://docs.expo.dev/eas/metadata/config/)

### App Privacy data inventory for owner review

These are source findings and candidate disclosure areas, not finalized Apple questionnaire answers. Review Apple's definitions for collection, optional disclosure and linkage, including hosting/delivery providers and diagnostics. Encryption by itself does not settle whether information is collected. No advertising, tracking or session-replay SDK is permitted by repository rules. [Apple App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/)

| Processing area            | Data and purpose                                                                                                                                                                                                                                                                         | Scope / release verification                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account and authentication | Email, display name, opaque account IDs, authentication credentials/session records, invite and security state operate the account. Avatar uploads are re-encoded and stored privately, without E2EE.                                                                                    | Both apps; examine contact info, user identifiers and user-content disclosures. Confirm account-linked fields and the live deletion flow.                                     |
| Calendar                   | Titles/descriptions/locations and calendar/category names are encrypted client-side; scheduling/sharing metadata and participant addresses remain readable. Subscription feeds and invitation delivery have separate readable-content limits.                                            | Calendar and shared account services; verify public/subscribed/shared/invitation flows and the privacy page's existing encryption exceptions.                                 |
| Mail                       | Messages, attachments, addresses, contacts and mailbox metadata support send/receive, storage and search. Normal email is readable during ordinary delivery; encrypted storage/OpenPGP do not make every mail flow E2EE. Known backend token/ingestion gaps remain documented in AGENTS. | Mail; assess emails/text messages, contacts and other content. Confirm the deployed vault/delivery behavior and on-device search boundaries.                                  |
| Push and extension         | APNs token, opaque bundle/device/event/mail identifiers, delivery preference/job metadata and encrypted reminder title. The extension decrypts/fetches previews on-device and currently holds the session cookie in shared keychain.                                                     | Calendar reminders / Mail new-mail alerts; inspect payloads and verify locked-device fallback, sign-out cleanup and the outstanding scoped-token gap.                         |
| Diagnostics                | None: error reporting (Errex) was removed from the web, native apps, API and worker, and repository rules ban crash/error-reporting SDKs. No third-party analytics. API logs use categories and request IDs and stay with the hosting provider. | Both apps; confirm the release archives contain no crash-reporting SDK. |
| Hosting and delivery       | Railway operates API/database/mail/notification/avatar infrastructure; Vercel serves web and passkey bridge; Expo provides builds/OTA; Apple delivers APNs. Providers receive necessary connection metadata.                                                                             | Confirm provider contracts, regions, operational logs/backups and actual retention; account sessions themselves do not retain IP/user-agent metadata.                         |
| Local device data          | Secure-store/keychain auth and keys, encrypted Mail snapshot and optional encrypted search index; no persistent query cache. Photo permission is used for a selected avatar; camera/microphone permission is disabled.                                                                   | Both apps; confirm sign-out/account-switch deletion and permission strings in the built archive. Local-only processing and server transfers need separate review.             |

Retention source: `apps/notifications/src/retention.rs`; account deletion: `apps/backend/src/account/{service,queries}.rs`; payload/log scrubbing: shared `redaction-policy.js` and client report-redaction helpers. The public policy lists live cleanup eligibility windows and does not promise unverified backup purge times. Confirm a private contact route before declaring privacy/support readiness complete.

### Privacy-manifest and encryption evidence

The shared app config explicitly sets `NSPrivacyTracking: false` with no tracking domains. React Native/Expo retain their default SDK manifest aggregation. Source manifests in React Native and Expo FileSystem declare required reasons such as UserDefaults, file timestamps and disk space; the actual release archive still needs inspection for SDK coverage and required reasons. The Swift notification extension uses CryptoKit, Security/keychain, ephemeral URLSession and UserNotifications; this source inspection found no direct UserDefaults, disk-space, boot-time or file-timestamp API call to assign an extension-specific required reason. Do not add arbitrary reason codes to make validation pass. Compare the actual binary/SDK inventory with Apple's approved reasons, and use Xcode's privacy report to review collection declarations and SDK coverage. [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/)

For the export-compliance determination, inventory at least `packages/e2ee` (AES-GCM-256, RSA-OAEP-4096, HMAC-SHA-256), native `react-native-quick-crypto`, Argon2id and OpenPGP usage, HTTPS transport and the CryptoKit notification extension. Record which functions are implemented by the OS versus bundled libraries, the distribution territories, the applicable exemption basis and any required filing/Apple documents. The central config currently declares non-exempt encryption instead of assuming an exemption. Complete Apple’s questionnaire before beta review. Standard algorithms alone do not settle whether an exemption applies. Apple’s documentation lists a French declaration for bundled standard encryption when distributing in France; confirm launch territories and required filings with the owner. Supply any Apple-issued code through the app/project-scoped EAS variable `SOLACE_IOS_ENCRYPTION_COMPLIANCE_CODE`, separately for each app and relevant build environment. Do not share one app’s approval code across both projects. Update the native version if embedded configuration changes after a binary exists. [Apple export-compliance process](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

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
- The earlier custom Python IPA verifier was removed in favor of EAS Build/Submit and Apple archive processing. Release-selection tests reject wrong/failed/ambiguous EAS builds and keep the exact build ID; the Node extension-plugin regression checks idempotence, version propagation, its privacy manifest and iPhone-only target families. A real store build/upload remains pending.
- Repository lint, both root TypeScript checks, workflow Actionlint/ShellCheck and frozen installation with pinned Bun 1.4.4 pass. Existing lint warnings are outside the changed files. An additional standalone calendar-core typecheck fails on existing test fixtures; the same errors reproduce from `origin/master` in an isolated source snapshot, while the changed link module/tests pass strict checking.
- Expo dependency checks and Expo Doctor (21/21 each) pass for both apps. Doctor initially found two local copies of the same expo-font version; removing the stale nested copy and reinstalling from the frozen lockfile resolved it without a lockfile change. Live read-only EAS config resolves the intended Calendar TestFlight and Mail production identities/channels and runtime 1.0.1.
- No manual native build, OTA publish, metadata push, App Store Connect mutation, web deployment or installed-device test was performed for this follow-up. Store credentials/app IDs, declarations, reviewer account setup and TestFlight/device evidence remain pending above. The owner has now approved the public support contact and iPhone-only targeting.

- The full `cargo xtask check` passes, including formatting, Clippy, unit tests, all 439 API cases in both development and production after integrating the updated master, code generation/destination checks and release memory budgets. Earlier local runs failed in mail-delivery integration cases; recreating only the disposable test Stalwart container restored the complete run without changing backend code or tests.

- Guardener rejects the default branch’s unsupported `key.data` entries with empty-host/unknown-signer errors. The follow-up uses the documented `key.kms` URLs for the owner’s published GitHub GPG keyring and GitHub’s web-flow key; the signed commit verifies against that downloaded keyring. Guardener reads default-branch policy, so remote enforcement must be rechecked after the correction is merged. GitHub’s separate commit-verification badge reports `bad_email` for the existing key/author identity; no signing keys or account identities were changed. [Guardener commit verification](https://edu.chainguard.dev/chainguard/guardener/github/commit-verification/), [policy activation](https://edu.chainguard.dev/chainguard/guardener/github/configuration/)

### iPhone-only and EAS simplification validation

- The latest `origin/master` login-redirect fixes merged cleanly; no conflict markers remain. The prior merge had already been committed and pushed, contrary to the stale handoff description.
- Both store configurations resolve iPhone-only support and the non-exempt encryption declaration. The shared notification-extension plugin follows the main app’s device families and updates existing targets on reruns.
- Live EAS checks pass the small store preflight for Calendar TestFlight and Mail production, deriving release references and listing drafts without a build/upload. Shared deployment variables remain inherited after deleting the backed-up compatibility variables.
- `support@solace.onl` is an active alias on the owner’s existing mailbox; metadata readback and public SMTP recipient acceptance passed without sending a message. The receiving-account details and rollback metadata remain outside Git.
- Live API health and the existing privacy route return 200. The production support and passkey-association routes return 404; the public association route is now implemented from shared app IDs, and a production deployment remains a separate release gate.

- Vercel `solace-web` now has `SOLACE_APPLE_TEAM_ID` for production and preview, derived from the one team already attached to both apps’ EAS signing records. The association route authorizes only the two release bundle IDs; five tests cover configured and invalid/missing teams. Live associated-domain verification still requires deployment and device installation.
- Full native suites pass: native-core 49 suites / 382 tests, Calendar 45 / 526, Mail 50 / 362. Full web suite passes 114 suites / 815 tests, plus the five new association-route cases. The account-settings icon mock now includes the new help/privacy icons, fixing the eight failures from the prior PR check. Native/root TypeScript checks, strict release-script checking and Actionlint/ShellCheck pass; React Doctor found no issues in the changed web code.

- The complete `cargo xtask check` passes again after integrating the latest master: formatting, Clippy, unit tests, all 439 API tests in both development and production, code generation, Jest destinations and memory budgets. The first local attempt hit stale test-mail state; recreating only the disposable Stalwart test container resolved it without weakening tests.
- Earlier PR CI successfully built and published both iOS development artifacts on runtime `1.0.1`. The final iPhone/encryption changes therefore bump the shared native version to `1.0.2`, keeping old binaries on their compatible OTA runtime. These internal build results do not establish App Store signing, TestFlight upload or device acceptance.

- Final live EAS configuration and the Bun store preflight pass for both apps on both store profiles at version/runtime `1.0.2`, after compatibility-variable cleanup. Production uses channel `master`; TestFlight uses `testing`. No store build, upload or metadata push was initiated.

- The linked Vercel project disables preview deployments. The PR push therefore does not produce a preview, and production support/passkey-route verification remains pending deployment after review. The CLI deployment ignore rules explicitly include the shared identity JSON used by the association route.

### Upload filtering and first Calendar store build

- The owner’s first Calendar TestFlight build `4110cc4a-b317-4fb9-9f32-6c06211fee36` finished successfully on source `6b308afea21d96cd85b07f66b7c64d2540f3fafc`, version/runtime `1.0.2`, build number `2`. EAS metadata confirms store distribution, the intended Calendar project/bundle/profile and channel `testing`. This is build evidence; Apple processing, TestFlight upload and installed-device acceptance remain separate.
- The metadata-upload HTTP 400 was a warning for that successful build. Local archive inspection found unexcluded agent worktrees and unrelated service/web sources. Root `.easignore` now retains both native apps/shared packages, workspace manifests, patches and the retired Prisma install-hook input while excluding local state, credentials, generated projects and unrelated source.
- Both inspected upload copies contain 1002 files and compress to approximately 11.12 MiB, versus the owner’s reported 996 MB archive. A frozen Bun 1.4.4 install from the filtered copy succeeds, generates the retired Prisma client, and preserves the lockfile. Direct metadata-upload probes with the new file list succeed on both the installed EAS CLI 22.0.0 and the repository-pinned 24.6.0; these probes do not establish the exact cause of the earlier HTTP 400.

- Both iOS JavaScript bundles export successfully from the filtered upload copy after its frozen install, including Mail’s React Compiler transform. This validates bundling inputs; it is not a new signed native build or installed-device test.
