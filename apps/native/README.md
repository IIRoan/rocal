# Solace Native Build Setup

This app is configured for Expo/EAS as the `solace-mobile` project.

## Current app identifiers

- Expo slug: `solace-mobile`
- Deep-link scheme: `solace`
- Production update channel: `main`
- iOS bundle identifier: `com.solace.mobile`
- Android application ID: `com.solace.mobile`

## Local env

Create `apps/native/.env` or `apps/native/.env.local` with:

```env
EXPO_PUBLIC_API_URL=https://api.example.com
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
9. Create or confirm an EAS Update branch named `main`.
10. Link the `main` channel to the `main` branch in Expo if it is not already linked.

## Backend auth setup

Standalone native auth should use:

```env
MOBILE_AUTH_CALLBACK_URL=solace://api/auth
AUTH_COOKIE_SAME_SITE=none
```

Production backend values should also use HTTPS for `BACKEND_URL` and `FRONTEND_URL`.

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
bun run update:main -- --message "main update"
```

## GitHub automation

Pushes to `main` can publish an EAS Update automatically through GitHub Actions.

Required GitHub secret:

- `EXPO_TOKEN`

Required Expo EAS environment values for the `production` environment:

- `EXPO_PUBLIC_API_URL`
