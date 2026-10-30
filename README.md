# Solace

A calendar and mail monorepo: web frontend, native Calendar and Mail apps, API backend, notifications worker, and the Stalwart mail stack.

## Project Structure

- **apps/web** - Next.js frontend with shadcn/ui components
- **apps/backend** - The Rust API (axum + SeaORM) serving `api.solace.onl`; DTOs, the API suite and tooling live in `crates/` and `xtask/` (see [plans/001-rust-backend-migration.md](plans/001-rust-backend-migration.md))
- **apps/native-calendar** - Expo app "Solace Calendar". See [apps/native-calendar/README.md](apps/native-calendar/README.md).
- **apps/native-mail** - Expo app "Solace Mail". See [apps/native-mail/README.md](apps/native-mail/README.md).
- **apps/notifications** - Rust worker for scheduled reminder email and APNs notifications
- **apps/stalwart** - Stalwart mail server image, JMAP config plan, VPS HAProxy/frp. See [apps/stalwart/README.md](apps/stalwart/README.md).
- **apps/gatus** - Status page (`status.solace.onl`). See [apps/gatus/README.md](apps/gatus/README.md).
- **packages/ui** - Shared UI component library
- **packages/native-core** - Code shared by both native apps (auth, E2EE, settings, push, sheets, theme)
- **packages/logger** - Shared logging utilities
- **packages/eslint-config** - ESLint configurations
- **packages/typescript-config** - TypeScript configurations

## Technology Stack

- Frontend: Next.js, React, Tailwind CSS, shadcn/ui
- Backend: Rust (axum, SeaORM) on Railway, PostgreSQL; web on Vercel
- Notifications: Rust, Stalwart JMAP (noreply identity), APNs
- Mail server: Stalwart (JMAP) on Railway, inbound/outbound via VPS tunnels
- Authentication: Better Auth's protocol and tables, served by the Rust API, with passkey support
- Database: PostgreSQL; SeaORM migrations in `apps/backend/src/db/migrations`, applied by the API and the worker at startup

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

The API and the worker run against local podman services (Postgres 18, a test Stalwart and an S3 mock) and a `solace_test_dev` database that survives restarts; `cargo xtask dev backend` starts the services and creates the database the first time. Values that differ locally, such as a tunnel's URLs, go in `apps/backend/.env`.

## Testing and TDD

Run the full test suite:

```bash
bun run test
```

Run the API's unit tests, then the black-box API suite against the local test environment:

```bash
bun run test:backend
cargo xtask test-env up && cargo xtask test-env template
cargo test -p solace-api-tests --test api
```

## Database migrations

Migrations are Rust files in `apps/backend/src/db/migrations`, run by SeaORM's migrator. The API and the notifications worker apply any pending ones at startup under a Postgres advisory lock, so a deploy brings the database up to date by itself; `seaql_migrations` records what ran.

```bash
cargo xtask migrate new add_event_colour   # scaffold and register a migration, then write its `up`
cargo xtask migrate up                     # apply it to the test template
cargo xtask entities                       # regenerate the SeaORM entities from the migrated schema
cargo xtask migrate status                 # applied and pending migrations of a test database
```

`cargo xtask check` fails when the entities differ from the migrations. Never edit a migration that has shipped; add a new one.

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

- Backend auth/cors supports extra origins through `TRUSTED_ORIGINS` (see `apps/backend/.env.example`).
- The native app uses secure storage for auth state and the same backend API as the web app.
