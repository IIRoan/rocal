# Agent Instructions

This repository is a monorepo containing a web frontend, a backend API, and a notifications service, structured using Bun workspaces.

## High-Level Architecture
- **apps/web**: Next.js frontend built with React 19, Tailwind CSS v4, and `shadcn/ui`. It generates a static export (`out/`) that is wrapped as a native mobile application via Capacitor and Ionic. It uses `react-native-web` for cross-platform components.
- **apps/backend**: API server built with Elysia.js running on Bun. Uses Prisma ORM with PostgreSQL and Better Auth for authentication (including passkey support). AI functionality utilizes `@openrouter/ai-sdk-provider`. The backend follows a service-layer architecture:
  - `routes/` — Thin HTTP adapters handling auth, request validation (TypeBox schemas), rate limiting, and response headers. Routes delegate all business logic to services.
  - `contracts/` — TypeScript interfaces and DTO types defining each service's operations. These are the source of truth for service signatures.
  - `services/` — All business logic lives here: input validation, database queries, transformations, notification scheduling. Services receive `PrismaClient` via constructor injection and never touch HTTP types.
  - `lib/` — Shared utilities (auth, error types, Prisma client, recurrence engine, ICS export, notification calculator, etc.).
- **apps/notifications**: A Go service responsible for scheduled email notifications via Resend API and HTML templates.
- **packages/***: Shared libraries such as `@workspace/ui` (components), `logger`, TS/ESLint configurations, and domain-specific logic (`calendar-core`, `calendar-client`, `mobile-ui`).

### Mobile App Context
- iOS and Android mobile projects (`apps/web/ios`, `apps/web/android`) are checked into source control, excluding build artifacts.
- Local mobile testing uses live reload commands from `apps/web`: `bun run mobile:ios:live` or `bun run mobile:android:live:usb`.
- Cross-origin requests from native Capacitor webviews require `AUTH_COOKIE_SAME_SITE=none` in the backend environment to ensure session cookies function properly. Backend auth/cors requires native origins appended to `TRUSTED_ORIGINS`.

## Common Development Commands
Execute commands from the repository root unless stated otherwise.

- **Install Dependencies**: `bun run install:all`
- **Start All Services**: `bun run dev` (starts frontend, backend, and notifications simultaneously)
- **Start Specific Service**: `bun run dev:frontend`, `bun run dev:backend`, `bun run dev:notifications`
- **Build Services**: `bun run build`
- **Lint Codebase**: `bun run lint`
- **Typecheck**: `bun run typecheck`
- **Testing**:
  - Run all tests: `bun run test` (uses Jest)
  - Run a single test: `bun run test <path/to/test.file>`
- **Database Operations** (run within `apps/backend`):
  - Generate Prisma client: `bun run db:generate`
  - Create and apply migrations: `bun run db:migrate`
  - Deploy existing migrations: `bun run db:deploy`
  - Reset database schema: `bun run db:reset`
