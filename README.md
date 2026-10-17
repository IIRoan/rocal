# Solace

A calendar and mail monorepo: web frontend, native Calendar and Mail apps, API backend, notifications worker, and the Stalwart mail stack.

## Project Structure

- **apps/web** - Next.js frontend with shadcn/ui components
- **apps/backend** - The Rust API (axum + SeaORM) serving `api.solace.onl`; DTOs, the API suite and tooling live in `crates/` and `xtask/` (see [plans/001-rust-backend-migration.md](plans/001-rust-backend-migration.md))
- **retired/backend** - The previous Elysia.js API, kept deployed on Vercel for rollback until plan 001 step 7 deletes it; the Prisma migrations still live here
- **apps/native-calendar** - Expo app "Solace Calendar". See [apps/native-calendar/README.md](apps/native-calendar/README.md).
- **apps/native-mail** - Expo app "Solace Mail". See [apps/native-mail/README.md](apps/native-mail/README.md).
- **apps/notifications** - Go service for scheduled email and APNs notifications
- **apps/stalwart** - Stalwart mail server image, JMAP config plan, VPS HAProxy/frp. See [apps/stalwart/README.md](apps/stalwart/README.md).
- **apps/gatus** - Status page (`status.solace.onl`). See [apps/gatus/README.md](apps/gatus/README.md).
- **packages/ui** - Shared UI component library
- **packages/native-core** - Code shared by both native apps (auth, E2EE, settings, push, sheets, theme)
- **packages/logger** - Shared logging utilities
- **packages/eslint-config** - ESLint configurations
- **packages/typescript-config** - TypeScript configurations

## Technology Stack

- Frontend: Next.js, React, Tailwind CSS, shadcn/ui
- Backend: Elysia.js, Bun, Prisma, PostgreSQL
- Notifications: Go, Stalwart JMAP (noreply identity), APNs
- Mail server: Stalwart (JMAP) on Railway, inbound/outbound via VPS tunnels
- Authentication: Better Auth with passkey support
- Database: PostgreSQL with Prisma ORM

## Development

Install dependencies for all apps:

```bash
bun install
```

Start all services in development:

```bash
bun run dev
```

Start individual services:

```bash
bun run dev:web
bun run dev:backend
bun run dev:notifications
```

## Testing and TDD

Run the full test suite:

```bash
bun run test
```

Run backend-only tests while refactoring service code:

```bash
bun run test:backend
cd retired/backend
bun run test __tests__/services/category.service.test.ts
```

Cleanup direction for backend work:

- Write or update service-level characterization tests before moving validation or persistence logic.
- Keep routes as thin adapters and move reusable normalization and validation into small `retired/backend/lib` domain helpers.
- Refactor one domain at a time so route contracts remain stable while service internals get simpler.

## Building

Build all applications:

```bash
bun run build
```

## Mobile Development (Expo React Native)

Mobile ships as two Expo apps that share `packages/native-core`: `apps/native-calendar` (Solace Calendar) and `apps/native-mail` (Solace Mail). Both use the same auth and backend.

Common commands:

```bash
bun run dev:calendar
bun run dev:mail

cd apps/native-calendar   # or apps/native-mail
bun run build:ios
bun run build:android
```

Notes:

- Backend auth/cors supports extra origins through `TRUSTED_ORIGINS` (see `retired/backend/.env.example`).
- The native app uses secure storage for auth state and the same backend API as the web app.
