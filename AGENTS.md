# Agent Instructions

This repository is a monorepo for a calendar application (Solace), containing a web frontend, a native mobile app, a backend API, a notifications service, and shared packages, structured using Bun workspaces.

## High-Level Architecture

- **apps/web**: Next.js frontend built with React 19, Tailwind CSS v4, and `shadcn/ui`. Uses `@workspace/calendar-client`, `@workspace/calendar-core`, `@workspace/design-tokens`, and `@workspace/e2ee` for shared logic.
- **apps/native**: Expo React Native app (SDK 55, React Native 0.83, React 19) replacing the previous mobile webview experience. Uses Expo Router for file-based navigation, `StyleSheet.create()` with a custom `ThemeProvider` for styling (no NativeWind/Tailwind), `react-native-gesture-handler` + `react-native-reanimated` for gestures, and `expo-secure-store` for auth token storage. Consumes the same shared packages as the web app.
- **apps/backend**: API server built with Elysia.js running on Bun. Uses Prisma ORM with PostgreSQL and Better Auth for authentication (including passkey support). AI functionality utilizes `@openrouter/ai-sdk-provider`. The backend follows a service-layer architecture:
  - `routes/` — Thin HTTP adapters handling auth, request validation (TypeBox schemas), rate limiting, and response headers. Routes delegate all business logic to services.
  - `contracts/` — TypeScript interfaces and DTO types defining each service's operations. These are the source of truth for service signatures.
  - `services/` — All business logic lives here: input validation, database queries, transformations, notification scheduling. Services receive `PrismaClient` via constructor injection and never touch HTTP types.
  - `lib/` — Shared utilities (auth, error types, Prisma client, recurrence engine, ICS export, notification calculator, etc.).
- **apps/notifications**: A Go service responsible for scheduled email notifications via Resend API and HTML templates.

### Shared Packages

| Package                        | Purpose                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@workspace/calendar-client`   | Platform-agnostic HTTP client and typed API service for all backend endpoints. Accepts a configurable base URL and optional `E2eeProvider`.           |
| `@workspace/calendar-core`     | Platform-agnostic React hooks, date utilities, validation logic, TypeScript types, and view model helpers.                                            |
| `@workspace/design-tokens`     | Colors, spacing, typography, border radii, and shadows in platform-agnostic TypeScript. Consumed by Tailwind (web) and ThemeProvider (native).        |
| `@workspace/e2ee`              | End-to-end encryption abstraction (AES-GCM-256, RSA-OAEP-4096, HMAC-SHA-256) with a `CryptoProvider` interface for platform-specific crypto backends. |
| `@workspace/calendar-ics`      | ICS export and recurrence logic.                                                                                                                      |
| `@workspace/ui`                | Shared React UI components (web-focused, shadcn/ui based).                                                                                            |
| `@workspace/mobile-ui`         | Legacy cross-platform components using `react-native-web`, retained only for migration reference.                                                     |
| `@workspace/logger`            | Shared logging utility.                                                                                                                               |
| `@workspace/eslint-config`     | Shared ESLint configuration.                                                                                                                          |
| `@workspace/typescript-config` | Shared TypeScript configuration.                                                                                                                      |

### Native App Structure

The native app uses Expo Router with tab-based navigation:

```
apps/native/app/
├── _layout.tsx                 # Root layout: providers (Query, Auth, Theme, E2EE)
├── (auth)/                     # Auth screens (sign-in, sign-up)
├── (tabs)/                     # Main tab group (Calendar, Search, Settings)
│   ├── calendar/               # Calendar views (month/week/day/3day/agenda)
│   ├── search/                 # Event search
│   └── settings/               # User settings
├── event/                      # Event detail, create, edit screens
├── calendar-manage/            # Calendar CRUD screens
├── category-manage/            # Category CRUD screens
├── subscription/               # ICS subscription screens
└── +not-found.tsx
```

Native app source code lives in `apps/native/src/` with `components/`, `providers/`, `lib/`, and `__tests__/` directories.

### Mobile App Context

The native app authenticates against the backend using Better Auth with session-based cookies. Auth tokens are stored in `expo-secure-store` (iOS Keychain / Android Keystore). The backend CORS and `TRUSTED_ORIGINS` must include the native app's origin.

The native mobile app replaces the previous web-based mobile approach and shares the same backend/auth setup as the web app.

### Native Data Mutation Convention

When mutating data that already exists in the React Query cache (e.g. toggling a star, marking as read, assigning a label), **always use optimistic `onMutate` patches** that update the cached item in-place via `setQueryData`. Never blanket-invalidate the entire `["mail"]` query scope — this causes full refetches that show loading spinners and discard the user's scroll position. Only `invalidateQueries({ queryKey: ["mail", "messages"] })` on destructive mutations (delete, move) where the item leaves the list. On mutation failure, call `invalidateMessages()` to refetch and restore server truth.

## Common Development Commands

Execute commands from the repository root unless stated otherwise.

- **Install Dependencies**: `bun run install:all`
- **Start All Services**: `bun run dev` (starts web frontend, backend, and notifications simultaneously)
- **Start Specific Service**:
  - `bun run dev:frontend` — Next.js web app
  - `bun run dev:backend` — Elysia.js API server
  - `bun run dev:native` — Expo native app (`expo start`)
  - `bun run dev:notifications` — Go notifications service
- **Build Services**: `bun run build`
- **Lint Codebase**: `bun run lint`
- **Typecheck**:
  - `bun run typecheck` — Web + backend + notifications
  - `bun run typecheck:native` — Native app
- **Testing**:
  - Run all tests: `bun run test` (uses Jest)
  - Run a single test: `bun run test <path/to/test.file>`
  - Backend tests: `bun run test:backend`
  - Native tests: `bun run test:native`
  - UI package tests: `bun run test:ui`
  - Notifications tests: `bun run test:notifications`
  - Coverage: `bun run test:coverage`
- **Database Operations** (run within `apps/backend`):
  - Generate Prisma client: `bun run db:generate`
  - Create and apply migrations: `bun run db:migrate`
  - Deploy existing migrations: `bun run db:deploy`
  - Reset database schema: `bun run db:reset`
- **Native App Builds** (run within `apps/native`):
  - iOS: `bun run build:ios` (EAS Build)
  - Android: `bun run build:android` (EAS Build)
