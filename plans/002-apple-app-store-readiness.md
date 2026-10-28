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
- [ ] Confirm the repository/CI configuration used for future releases points to the new project; the default branch still uses the old project until these changes are merged.
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

- [ ] Expand `apps/web/app/privacy/page.tsx` with actual retention/deletion policies, provider information and a contact process.
- [ ] Add an accessible privacy-policy link to both native apps through shared settings in `packages/native-core`.
- [ ] Provide a working public support URL and an in-app way to contact support.
- [ ] Inventory data processing for each app's App Privacy answers, including accounts, mail, readable calendar metadata, avatars, push, diagnostics, EAS and bundled SDKs.
- [ ] Inspect privacy manifests and required API reasons in the generated main-app and extension archives; use Expo's `ios.privacyManifests` configuration where needed.
- [ ] Determine export-compliance requirements for the actual E2EE libraries and launch territories; document the basis for any exemption and supply required documents.

Both app configs currently set `ITSAppUsesNonExemptEncryption: false`; source inspection alone does not establish whether that declaration is correct. Account deletion already exists in shared native settings and the Rust API; validate it rather than introducing a second deletion flow. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Apple encryption declarations](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

## 4. Production release controls

- [x] Gate production OTA publishing behind successful native checks and an explicit default-branch release dispatch; default-branch pushes now publish only preview updates.
- [x] Share build/update routing: trusted PRs use development, testing-branch pushes use testing, and default-branch pushes use preview. Profile channels and environments come from `eas.json`.
- [x] Add matching testing internal artifacts and a separate store-distribution TestFlight profile on the testing channel; keep production's existing master channel for binary compatibility.
- [ ] Document native-dependency/plugin changes requiring an app-version bump and new binary under the existing `appVersion` policy.
- [ ] Test OTA installation, deferred installation and rollback on compatible release binaries.
- [ ] Confirm production EAS environment values and production API/passkey origins.
- [x] Retain internal development/preview builds, add testing, and provide a separate manually dispatched iOS App Store workflow with optional TestFlight submission and App Store Connect ID preflight.

## 5. Reviewer access and onboarding

- [ ] Prepare a dedicated reviewer account through a normally accepted invite, with mailbox provisioning and E2EE setup completed.
- [ ] Add synthetic sample messages and events and document the review steps.
- [ ] Ensure reviewer access does not depend on the operator's personal passkey or device.
- [ ] Explain invite-only onboarding and the relationship between Calendar and Mail in review notes and listing copy.
- [ ] Confirm backend and support availability throughout review.

Native signup currently requires an invite, and Mail provisioning requires mailbox approval. Native login uses first-party email/password with passkey step-up; adding Sign in with Apple is conditional on future login choices. No native purchase integration was found in the initial audit; payment/IAP work is conditional on the launch business model. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 6. Verification and TestFlight

- [ ] Pass repository lint, both TypeScript typechecks, relevant tests and any required backend checks for changes made during preparation.
- [ ] Run Expo dependency/configuration checks for both apps and resolve release-blocking findings.
- [ ] Confirm the selected EAS image satisfies Apple's current Xcode and SDK requirements.
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

- [ ] Prepare separate names, descriptions, keywords, categories, copyright, support/privacy URLs and applicable iPhone/iPad screenshots using synthetic data.
- [ ] Decide whether to maintain supported listing fields through EAS Metadata; complete unsupported fields and screenshots in App Store Connect.
- [ ] Select the exact tested builds, complete declarations and reviewer instructions, and submit both apps for App Review.
- [ ] Resolve review feedback and choose the public release timing.
- [ ] Verify public downloads, login, notifications, support access and error reporting after release.

EAS Submit uploads a binary; public App Review and release remain separate App Store Connect steps. EAS Metadata is optional and currently beta. [EAS Submit](https://docs.expo.dev/submit/ios/), [EAS Metadata](https://docs.expo.dev/eas/metadata/)

## Preparation validation

- The full native suites passed during configuration preparation: native-core had 48 suites and 372 tests, Calendar had 43 suites and 491 tests, and Mail had 50 suites and 362 tests. Subsequent release-routing checks pass 47 Calendar tests and nine Mail artifact tests, including default-branch production restrictions, TestFlight profile inheritance and refusal of routing-override flags. Subprocess tests replace EAS with a local stub and never publish.
- Native-core, Calendar and Mail TypeScript checks pass.
- ESLint reports no findings in changed source files; native-core's full lint run exits successfully with seven warnings in unchanged files. Actionlint, including ShellCheck, passes for the build, update, App Store and reusable validation workflows.
- Repository checks pass for changed source files, and the new deployment-configuration rule passes across the full repository. React Doctor reports no issues; Mail's full component/hook compilation check passes with the shipped React Compiler.
- Fresh-process evaluation of all six Expo configurations matches the pre-centralization native settings exactly after excluding the new public runtime-environment metadata. Extension target names and bundle IDs agree with the shared settings. The earlier migration comparison separately verified Calendar's intended slug/project/update URL changes and its retained development scheme.
- Live `eas config` checks for Calendar preview and Mail production resolve the configured project, API/web/reporting values and passkey domains. A read-only `eas env:exec` check successfully loads the shared environment and runs the same validation used before builds/updates.
- Live `eas config` checks confirm both new TestFlight profiles resolve store distribution, the testing channel, the preview environment and the intended production bundle IDs. All four current channels in each project are mapped to their intended branches; their existing pause/protection states were retained.
- Live Expo reads verify reuse of signing references, matching channel rules/protection settings, copied version counters and inheritance of shared deployment variables by both apps. The old project remains available; build, installed-device and retirement evidence is tracked above.
