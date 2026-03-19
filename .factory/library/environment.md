# Environment

**Runtime:** Expo SDK 55, React Native 0.83.2, Reanimated 4.2.1, React 19.2.0
**Package manager:** bun (monorepo workspaces)
**OS:** Windows 10, 32GB RAM
**Node:** >=20, Bun >=1.0.0

**Monorepo structure:**
- `apps/mobile` — Expo React Native app
- `apps/web` — Next.js web app
- `packages/ui` — Shared UI components (both web and mobile via `.native.tsx`)
- `packages/calendar-client` — Calendar API client
- `packages/calendar-core` — Calendar logic
