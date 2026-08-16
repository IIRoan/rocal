# Solace Native Build Setup

This app is configured for Expo/EAS under the `astralgrove` org, project slug `solace`.

## Current app identifiers

|                        | Production / preview | Development                        |
| ---------------------- | -------------------- | ---------------------------------- |
| App name               | Solace               | Solace Dev                         |
| Icon                   | `assets/icon.png`    | `assets/icon-dev.png` (logo + DEV) |
| Deep-link scheme       | `solace`             | `solace-dev`                       |
| iOS bundle identifier  | `onl.solace.mobile`  | `onl.solace.mobile.dev`            |
| Android application ID | `onl.solace.mobile`  | `onl.solace.mobile.dev`            |

`APP_VARIANT=development` is what switches the binary to the Dev name, icon, scheme, and `.dev` identifiers so both builds can sit on a device at once.

This app targets **Expo SDK 57** (React Native 0.86, React 19.2). EAS iOS builds use the `sdk-57` image. After upgrading Expo or native modules, rebuild the development client — OTA updates cannot replace native binaries.

## Update channels

| EAS profile   | `APP_VARIANT` | Channel       | Notes                                 |
| ------------- | ------------- | ------------- | ------------------------------------- |
| `development` | `development` | `development` | Dev client, internal, Dev icon        |
| `preview`     | `preview`     | `preview`     | Internal store build, production icon |
| `production`  | `production`  | `master`      | App Store / Play, production icon     |

Runtime version uses the Expo **fingerprint** policy. OTA updates only apply when the native fingerprint matches.

## Local env

Create `apps/native/.env` or `apps/native/.env.local` with:

```env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_APP_URL=https://app.example.com
PASSKEY_ORIGIN=https://app.example.com
EXPO_OWNER=your-expo-account-or-org
EXPO_PROJECT_ID=your-eas-project-id
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
3. Create a new EAS project named `solace`.
4. Copy the project ID from the project settings page.
5. Set `EXPO_OWNER` to your Expo account/org name.
6. Set `EXPO_PROJECT_ID` to that EAS project ID.
7. In the Expo dashboard, configure credentials:
   - Android: let Expo manage the keystore unless you already have one.
   - iOS: connect the Apple Developer account/team and let Expo manage certificates/profiles.
8. Add `EXPO_PUBLIC_API_URL` in EAS environment variables if your build should target staging or production automatically.
9. If you want native passkeys, also add `PASSKEY_ORIGIN` (or reuse `NEXT_PUBLIC_APP_URL`) with the HTTPS app origin that Better Auth uses for passkeys.
10. Create or confirm EAS Update branches named `development`, `preview`, `testing`, and `master`.
11. Link each channel to the matching branch in Expo (`development`, `preview`, `testing`, `master`).

## Backend auth setup

Standalone native auth should use:

```env
MOBILE_AUTH_CALLBACK_URL=solace://api/auth
AUTH_COOKIE_SAME_SITE=none
PASSKEY_ORIGIN=https://app.example.com
```

The development client uses `solace-dev://api/auth`. The backend trusts both
`solace://` and `solace-dev://` callback origins by default.

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
- `app.config.ts` automatically adds the iOS `associatedDomains` entry when `PASSKEY_ORIGIN`, `NEXT_PUBLIC_APP_URL`, or `EXPO_PUBLIC_APP_URL` points at a non-local HTTPS origin.
- iOS still needs `https://<domain>/.well-known/apple-app-site-association`.
- Android still needs `https://<domain>/.well-known/assetlinks.json` with `delegate_permission/common.get_login_creds`.
- `EXPO_PUBLIC_APP_URL` should point at a reachable web deployment for the browser bridge.

## E2EE crypto

- Native WebCrypto comes from `react-native-quick-crypto`, installed at the Expo entry (`index.js`) before Expo Router loads any route. OpenPGP.js 6 requires `globalThis.crypto.subtle` while the module evaluates.
- Calendar E2EE uses that native `SubtleCrypto` via `createNativeCryptoProvider`. `expo-crypto` still supplies the CSPRNG (`getRandomValues`, `randomUUID`).
- Mail vault Argon2id and AES-GCM use the same native module, with `@noble/hashes` / `node-forge` only as a Jest / missing-module fallback.
- Rebuild the development client after adding or upgrading `react-native-quick-crypto` so the Nitro module is linked.

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
`build:dev:*` produces a development client with the Solace Dev icon and `.dev` bundle ID.

## OTA updates

When a newer bundle is on the channel, the app shows a full-screen prompt (Install / Later). Later hides that screen; **Settings → App** can still install or restart this session. Updates are not applied automatically on launch.

To publish an update manually to the branch used by the production channel:

```bash
bun run update:master -- --message "master update"
```

To publish an update manually to the preview channel:

```bash
bun run update:preview -- --message "preview update"
```

To publish an update to the development-client channel:

```bash
bun run update:development -- --message "dev update"
```

To publish an update manually to the PR/testing branch:

```bash
bun run update:testing -- --message "testing update"
```

## GitHub automation

| Git event | EAS update branch |
| --- | --- |
| Push to `main` or `master` | `preview` |
| Push to `testing` | `development` |
| Push to `master` | `master` (production) |
| Pull request | `testing` |

Required GitHub secret:

- `EXPO_TOKEN`

Required Expo EAS environment values for the `production` environment:

- `EXPO_PUBLIC_API_URL`
- `PASSKEY_ORIGIN` when native passkeys are enabled

Note: PR-triggered publishes are skipped for forked repositories because GitHub does not expose secrets to untrusted PRs.
