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

## Testing and TDD

Run the full test suite:
```bash
bun run test
```

Run backend-only tests while refactoring service code:
```bash
bun run test:backend
cd apps/backend
bun run test __tests__/services/category.service.test.ts
```

Cleanup direction for backend work:
- Write or update service-level characterization tests before moving validation or persistence logic.
- Keep routes as thin adapters and move reusable normalization and validation into small `apps/backend/lib` domain helpers.
- Refactor one domain at a time so route contracts remain stable while service internals get simpler.

## Building

Build all applications:
```bash
bun run build
```

## Mobile Development (Expo React Native)

The native mobile app now lives in `apps/native` and uses Expo with React Native.

Common commands:
```bash
bun run dev:native

cd apps/native
bun run build:ios
bun run build:android
```

Notes:
- Backend auth/cors supports extra origins through `TRUSTED_ORIGINS` (see `apps/backend/.env.example`).
- The native app uses secure storage for auth state and the same backend API as the web app.
