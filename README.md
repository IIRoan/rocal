# Solace

A monorepo application with three main services: web frontend, API backend, and notifications service.


## Project Structure

- **apps/web** - Next.js frontend with shadcn/ui components
- **apps/backend** - Elysia.js API server with authentication and database
  - `routes/` - Thin HTTP adapters (auth, validation schemas, headers)
  - `contracts/` - TypeScript interfaces and DTOs for each service
  - `services/` - Business logic (validation, database, transformations)
  - `lib/` - Shared utilities (auth, errors, Prisma, recurrence engine, etc.)
- **apps/notifications** - Go service for scheduled email notifications
- **packages/ui** - Shared UI component library
- **packages/logger** - Shared logging utilities
- **packages/eslint-config** - ESLint configurations
- **packages/typescript-config** - TypeScript configurations

## Technology Stack

- Frontend: Next.js, React, Tailwind CSS, shadcn/ui
- Backend: Elysia.js, Bun, Prisma, PostgreSQL
- Notifications: Go, Resend API, HTML templates
- Authentication: Better Auth with passkey support
- Database: PostgreSQL with Prisma ORM

## Development

Install dependencies for all apps:
```bash
bun run install:all
```

Start all services in development:
```bash
bun run dev
```

Start individual services:
```bash
bun run dev:frontend
bun run dev:backend
bun run dev:notifications
```

## Building

Build all applications:
```bash
bun run build
```

## Mobile Development (Next.js + Ionic + Capacitor)

The web app in `apps/web` is configured for static export (`out/`) and can be wrapped as a native app with Capacitor.

Common commands:
```bash
cd apps/web
bun run mobile:sync
bun run mobile:open:ios
```

Fast iOS iteration (closest to Expo-style live reload):
```bash
cd apps/web
bun run mobile:ios:live
```

Fast Android iteration on Windows (USB device):
```bash
# Terminal 1 (frontend on LAN-visible host)
cd apps/web
bun run mobile:dev

# Terminal 2 (backend)
cd apps/backend
bun run dev

# Terminal 3 (run on Android with live reload)
cd apps/web
bun run mobile:android:devices
bun run mobile:android:live:usb -- --target=<device-id>
```

Notes:
- Commit `apps/web/ios` and `apps/web/android` projects, but ignore generated user/build artifacts (already configured in `.gitignore`).
- Backend auth/cors supports extra origins through `TRUSTED_ORIGINS` (see `apps/backend/.env.example`).
- For cross-site cookie auth in native webviews over HTTPS, set `AUTH_COOKIE_SAME_SITE=none`.
