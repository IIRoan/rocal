# Solace Native Build Setup

This app is configured for Expo/EAS as the `solace-mobile` project.

## Current app identifiers

- Expo slug: `solace-mobile`
- Deep-link scheme: `solace`
- PR update channel: `testing`
- Production update channel: `master`
- iOS bundle identifier: `com.solace.mobile`
- Android application ID: `com.solace.mobile`

## Local env

Create `apps/native/.env` or `apps/native/.env.local` with:

```env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_APP_URL=https://app.example.com
PASSKEY_ORIGIN=https://app.example.com
EXPO_OWNER=your-expo-account-or-org
EXPO_PROJECT_ID=your-eas-project-id
```

## Expo.dev setup

1. Sign in to `https://expo.dev`.
2. Create or choose the Expo account or organization that should own the app.
3. Create a new EAS project named `solace-mobile`.
4. Copy the project ID from the project settings page.
5. Set `EXPO_OWNER` to your Expo account/org name.
6. Set `EXPO_PROJECT_ID` to that EAS project ID.
7. In the Expo dashboard, configure credentials:
   - Android: let Expo manage the keystore unless you already have one.
   - iOS: connect the Apple Developer account/team and let Expo manage certificates/profiles.
8. Add `EXPO_PUBLIC_API_URL` in EAS environment variables if your build should target staging or production automatically.
9. If you want native passkeys, also add `PASSKEY_ORIGIN` (or reuse `NEXT_PUBLIC_APP_URL`) with the HTTPS app origin that Better Auth uses for passkeys.
10. Create or confirm an EAS Update branch named `testing`.
11. Create or confirm an EAS Update branch named `master`.
12. Link the `testing` channel to the `testing` branch in Expo if it is not already linked.
13. Link the `master` channel to the `master` branch in Expo if it is not already linked.

## Backend auth setup

Standalone native auth should use:

```env
MOBILE_AUTH_CALLBACK_URL=solace://api/auth
AUTH_COOKIE_SAME_SITE=none
PASSKEY_ORIGIN=https://app.example.com
```

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

- Native now uses a browser-based Better Auth passkey bridge across Expo Go and normal native runtimes, so the same passkey actions work without native-only modules.
- `app.config.ts` automatically adds the iOS `associatedDomains` entry when `PASSKEY_ORIGIN`, `NEXT_PUBLIC_APP_URL`, or `EXPO_PUBLIC_APP_URL` points at a non-local HTTPS origin.
- iOS still needs `https://<domain>/.well-known/apple-app-site-association`.
- Android still needs `https://<domain>/.well-known/assetlinks.json` with `delegate_permission/common.get_login_creds`.
- Expo Go does not expose the native passkey module, so `EXPO_PUBLIC_APP_URL` should point at a reachable web deployment for the browser bridge.

## Expo Go E2EE

- Expo Go now uses a JavaScript crypto fallback for E2EE when native SubtleCrypto is unavailable.
- Encryption still works, but first-time device bootstrap can be slower than in a development or production build with native crypto support.

## Build commands

From `apps/native`:

```bash
bun run build:dev:android
bun run build:preview:android
bun run build:android
bun run build:dev:ios
bun run build:preview:ios
bun run build:ios
```

`build:android` and `build:ios` use the `production` profile.

## Expo Go and OTA updates

For Expo Go locally:

```bash
bun run start:go
```

To publish an update manually to the branch used by the production channel:

```bash
bun run update:master -- --message "master update"
```

To publish an update manually to the PR/testing branch:

```bash
bun run update:testing -- --message "testing update"
```

## GitHub automation

Any PR can publish a `testing` EAS Update automatically, and pushes to `master` publish the `master` update automatically.

Required GitHub secret:

- `EXPO_TOKEN`

Required Expo EAS environment values for the `production` environment:

- `EXPO_PUBLIC_API_URL`
- `PASSKEY_ORIGIN` when native passkeys are enabled

Note: PR-triggered publishes are skipped for forked repositories because GitHub does not expose secrets to untrusted PRs.
