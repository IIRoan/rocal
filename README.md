# Solace

A monorepo application with three main services: web frontend, API backend, and notifications service.

## Project Structure

- **apps/web** - Next.js frontend with shadcn/ui components
- **apps/backend** - Elysia.js API server with authentication and database
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
