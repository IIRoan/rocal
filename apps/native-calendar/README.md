# Solace Calendar (native)

This app is configured for Expo/EAS under the `astralgrove` org with dashboard display name and project slug `solace-calendar`. It shares auth, E2EE, settings, push and UI primitives with `apps/native-mail` (Solace Mail) through `packages/native-core`.

## Current app identifiers

|                        | Production / preview | Development                        |
| ---------------------- | -------------------- | ---------------------------------- |
| App name               | Solace Calendar | Calendar Dev |
| Icon                   | `assets/icon.png` (logo + label) | `assets/icon-dev.png` (logo + label + DEV) |
| Deep-link scheme       | `solace` | `solace-dev` |
| iOS bundle identifier  | `onl.solace.calendar` | `onl.solace.calendar.dev` |
| Android application ID | `onl.solace.calendar` | `onl.solace.calendar.dev` |

EAS project: `@astralgrove/solace-calendar` (`4262422c-3b37-44aa-9074-efe6d194eb12`, defined in `packages/native-core/expo-apps.json`; `EXPO_PROJECT_ID` overrides it). Register `onl.solace.calendar` / `onl.solace.calendar.dev` (plus their `group.*` App Groups and NSE bundle IDs) in the Apple Developer account and add them to the site's `apple-app-site-association` `webcredentials` for passkeys.

Calendar moved to this EAS project during Apple-readiness preparation. It reuses the existing iOS signing material, Android keystores, native identifiers and update-channel names. Install a new native build to switch an existing installation to the new update endpoint; an ordinary OTA does not change the endpoint embedded in an older build. Keep the old `@astralgrove/solace` project (`1047b680-b99f-4671-9824-23b9a0487125`) until replacement builds, login, notifications and update checks are verified on devices. See the [migration checklist](../../plans/002-apple-app-store-readiness.md) and [Expo project-ID documentation](https://github.com/expo/fyi/blob/main/eas-project-id.md).

The device display name remains `Solace Calendar`. Canonical deep-link schemes stay `solace` / `solace-dev`; development builds additionally retain `exp+solace` for older Expo dev-client links and generate `exp+solace-calendar` for the new project.

`APP_VARIANT=development` is what switches the binary to the Dev name, icon, scheme, and `.dev` identifiers so both builds can sit on a device at once.

This app targets **Expo SDK 57** (React Native 0.86, React 19.2). EAS iOS builds use the `sdk-57` image. After upgrading Expo or native modules, rebuild the development client — OTA updates cannot replace native binaries.

## Update channels

| EAS profile   | `APP_VARIANT` | Channel       | Notes                                 |
| ------------- | ------------- | ------------- | ------------------------------------- |
| `development` | `development` | `development` | Dev client, internal, Dev icon        |
| `preview`     | `preview`     | `preview`     | Internal store build, production icon |
| `production`  | `production`  | `master`      | App Store / Play, production icon     |

Runtime version uses the Expo **`appVersion`** policy (`1.0.0` today) so OTAs keep matching installed binaries until you intentionally bump `version` and ship a new native build.

**Always publish updates via the profile helper** so `eas.json` build-profile `env` is applied and updates use the app config's runtime version:

```bash
bun run update:preview      # apps/native-calendar
bun run update:development
bun run update:master
```

Those scripts run `scripts/publish-update.ts`, which:
1. Reads the target channel/environment and inherited profile env from `eas.json`, then loads the shared EAS environment before validating and publishing
2. Uses the app config's `appVersion` runtime policy, or the explicit `EAS_UPDATE_RUNTIME_VERSION` override when targeting an older binary

Changing native modules, Expo plugins, or app `version` requires a **new native build**, not only an OTA.

## Shared Expo configuration

Native identities and stable defaults are defined once in [`packages/native-core/expo-apps.json`](../../packages/native-core/expo-apps.json). Both `app.config.ts` files delegate to the shared builder in `packages/native-core/expo-config.cjs`; update URLs, development IDs, App Groups and extension IDs are derived from that configuration.

Deployment values live in the `astralgrove` account's shared EAS environments:

| Variable | Environments | Purpose |
| --- | --- | --- |
| `SOLACE_API_URL` | development, preview, production | Backend origin |
| `SOLACE_APP_URL` | preview, production | Web and passkey origin |
| `SOLACE_SENTRY_DSN` | development, preview, production | Optional self-hosted error reporting |
| `SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS` | preview, production | Passkey associated-domain capability |

These are public app configuration values, never secrets. `eas.json` selects the variant and EAS environment through `APP_VARIANT` and `SOLACE_ENV_SOURCE=eas`. Builds and updates resolve the same values into `Constants.expoConfig.extra.runtimeEnvironment`, which native-core consumes. Local `.env` overrides are ignored for EAS deployment values. The pre-install build hook and OTA publisher reject missing required service values before building or publishing.

For local development, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_URL`, optional `PASSKEY_ORIGIN`, and `EXPO_PUBLIC_SENTRY_DSN` remain supported overrides. `EXPO_OWNER`, `EXPO_PROJECT_ID` and `EXPO_PROJECT_SLUG` can override the linked project for a fork; the repository's defaults need no overrides.

## Local env

Create `apps/native-calendar/.env` or `apps/native-calendar/.env.local` with:

```env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_APP_URL=https://app.example.com
APP_VARIANT=development
```

For local native development, `bun run dev` forces the app through
`https://cloudflared.roan.dev` by:

- setting `APP_VARIANT=development` and starting the Expo **dev client**
- exporting `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_URL`, and `PASSKEY_ORIGIN`
  to the Cloudflare URL for the Expo process
- auto-starting `cloudflared tunnel run rocal` using `~/.cloudflared/config.yml`
  by default

Optional overrides:

```env
CLOUDFLARED_PUBLIC_URL=https://cloudflared.roan.dev
CLOUDFLARED_TUNNEL_NAME=rocal
# CLOUDFLARED_CONFIG=/absolute/path/to/config.yml
# CLOUDFLARED_TUNNEL_TOKEN=your-cloudflare-tunnel-token
```

If you need Expo without the tunnel wrapper, use:

```bash
bun run dev:expo
```

## Expo.dev setup

1. Sign in to `https://expo.dev`.
2. Create or choose the Expo account or organization that should own the app.
3. Select the existing `solace-calendar` project; do not create another replacement project.
4. Confirm its UUID matches the shared `expo-apps.json` identity.
5. For a fork, set `EXPO_OWNER` to the owning account.
6. For a fork, set both `EXPO_PROJECT_ID` and `EXPO_PROJECT_SLUG` to the linked project.
7. In the Expo dashboard, configure credentials:
   - Android: let Expo manage the keystore unless you already have one.
   - iOS: connect the Apple Developer account/team and let Expo manage certificates/profiles.
8. Configure the shared EAS service variables listed above.
9. Set `SOLACE_APP_URL` to the HTTPS web origin used for passkeys; the associated domain is derived from it.
10. Create or confirm EAS Update branches named `development`, `preview`, `testing`, and `master`.
11. Link each channel to the matching branch in Expo (`development`, `preview`, `testing`, `master`).

## Backend auth setup

Standalone native auth should use:

```env
MOBILE_AUTH_CALLBACK_URL=solace://api/auth
AUTH_COOKIE_SAME_SITE=none
PASSKEY_ORIGIN=https://app.example.com
```

The development client uses `solace-dev://api/auth`. The backend trusts the
production and dev schemes of both apps (`solace`, `solace-dev`, `solace-mail`, `solace-mail-dev`) by default
(`DEFAULT_MOBILE_AUTH_CALLBACK_URLS` in `retired/backend/lib/origin-policy.ts`).

Production backend values should also use HTTPS for `BACKEND_URL` and `FRONTEND_URL`.

For GitHub OAuth, the GitHub app's **Authorization callback URL** must match:

```env
${BACKEND_URL}/api/auth/callback/github
```

For local LAN development with your current IP, that means:

```env
http://192.168.88.246:4001/api/auth/callback/github
```

## Native passkeys

- Native uses a browser-based Better Auth passkey bridge, so passkey actions work without native-only modules.
- EAS builds derive iOS `associatedDomains` from `SOLACE_APP_URL` when `SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS=true`; local builds use `EXPO_ENABLE_IOS_ASSOCIATED_DOMAINS=true` with the configured passkey/web origin.
- iOS still needs `https://<domain>/.well-known/apple-app-site-association`.
- Android still needs `https://<domain>/.well-known/assetlinks.json` with `delegate_permission/common.get_login_creds`.
- `SOLACE_APP_URL` (or the local `EXPO_PUBLIC_APP_URL` override) should point at a reachable HTTPS web deployment for the browser bridge.

## E2EE crypto

- Native WebCrypto comes from `react-native-quick-crypto`, installed at the Expo entry (`index.js`) before Expo Router loads any route. OpenPGP.js 6 requires `globalThis.crypto.subtle` while the module evaluates.
- Calendar E2EE uses that native `SubtleCrypto` via `createNativeCryptoProvider`. `expo-crypto` still supplies the CSPRNG (`getRandomValues`, `randomUUID`).
- Mail vault Argon2id and AES-GCM use the same native module, with `@noble/hashes` as the Jest / missing-module fallback for Argon2id only (AES-GCM has no JS fallback).
- Rebuild the development client after adding or upgrading `react-native-quick-crypto` so the Nitro module is linked.

## Build commands

From `apps/native-calendar`:

```bash
bun run build:dev:android
bun run build:preview:android
bun run build:android
bun run build:dev:ios
bun run build:preview:ios
bun run build:testing:ios
bun run build:testflight:ios
bun run build:ios
```

`build:android` and `build:ios` use the `production` profile. `build:testflight:ios` produces a store-signed beta on the `testing` channel; `build:testing:*` produces ad-hoc/APK builds on the same channel with the same preview environment.
`build:dev:*` produces a development client with the Calendar Dev icon and `.dev` bundle ID.

## OTA updates

When a newer bundle is on the channel, the app shows a full-screen prompt (Install / Later). Later hides that screen; **Settings → App** can still install or restart this session. Updates are not applied automatically on launch.

To publish an update manually to the branch used by the production channel:

```bash
bun run update:production -- --message "production update"
```

To publish an update manually to the preview channel:

```bash
bun run update:preview -- --message "preview update"
```

To publish an update to the development-client channel:

```bash
bun run update:development -- --message "dev update"
```

To publish an update manually to testing and TestFlight builds:

```bash
bun run update:testing -- --message "testing update"
```

## GitHub automation

| Source | Build profile | Distribution | Update channel | EAS environment |
| --- | --- | --- | --- | --- |
| Trusted pull request | `development` | Dev client, ad-hoc/APK | `development` | `development` |
| Push to `testing` | `testing` | Ad-hoc/APK | `testing` | `preview` |
| Push to the repository's default branch | `preview` | Ad-hoc/APK | `preview` | `preview` |
| Manual TestFlight build | `testflight` | App Store | `testing` | `preview` |
| Manual production release | `production` | App Store | `master` | `production` |

The production channel keeps its existing `master` name for installed-binary compatibility. `update:production` and the older `update:master` alias both resolve it from `eas.json`. A default-branch push publishes only preview updates.

`scripts/native-release-config.ts` selects the profile once for both build and update workflows; metadata reads app names, the EAS CLI version and each app's channel/environment from shared configuration. All workflows run native checks before builds or publishing. Internal artifact slots include `development`, `preview` and `testing`.

The **iOS App Store build** workflow is dispatched from the default branch, selects `testflight` or `production`, and optionally uploads the completed build to TestFlight. Uploading requires the app's `submit.production.ios.ascAppId` and EAS App Store signing/submission credentials. `production` OTA updates also require an explicit default-branch dispatch. The app-version runtime policy still requires a version bump and new binary for native changes.

Required GitHub secret:

- `EXPO_TOKEN`

The workflow publishes through the app's `scripts/publish-update.ts`. The shared publisher reads its channel and environment from `eas.json`, loads the EAS environment with `eas env:exec`, validates required service values and uses the app config's runtime version. The `testing` profile inherits `preview` while selecting its own channel. Native dependency or plugin changes require a version bump and a new binary before publishing an update for that runtime.

Deployment values are managed only in the shared EAS environment; neither GitHub Actions nor `eas.json` repeats the service URLs or reporting DSN. Publish through the profile helpers so variant selection, environment loading and validation stay consistent.

Note: PR-triggered publishes are skipped for forked repositories because GitHub does not expose secrets to untrusted PRs.
