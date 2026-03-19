# Mobile App

## Environment

Create `apps/mobile/.env` with:

```env
EXPO_PUBLIC_API_URL=http://192.168.88.242:3001/api/
```

`EXPO_PUBLIC_API_URL` is required for local device testing so the app does not fall back to `localhost`.

Accepted formats:

- `http://192.168.88.242:3001`
- `http://192.168.88.242:3001/api/`

The mobile app normalizes either form to the backend base URL and then uses:

- auth via `/api/auth`
- app API calls via `/api/...`

If you change `.env`, restart Expo so the new value is picked up.

## Start

```bash
bun run start
```

## Files

- `.env.example`: example local config
- `.env`: local device-specific config, ignored by git
