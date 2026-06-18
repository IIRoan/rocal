# Agent Instructions

This repository is a monorepo for **Solace** — a calendar and mail application — containing a web frontend, a native mobile app, a backend API, a notifications service, and shared packages, structured using Bun workspaces.

## High-Level Architecture

- **apps/web**: Next.js App Router frontend (React 19, Tailwind CSS v4, shadcn/ui **new-york** style). Primary routes: `/calendar`, `/mail`, `/login`. Feature code lives in `apps/web/components/`, `apps/web/hooks/`, and `apps/web/lib/`. Uses `@workspace/ui` for shared web/calendar UI, plus `@workspace/calendar-client`, `@workspace/calendar-core`, `@workspace/design-tokens`, and `@workspace/e2ee`.
- **apps/native**: Expo React Native app (SDK 55, React Native 0.83, React 19). File-based routing via Expo Router. Styling is **`StyleSheet.create()` + `useTheme()`** from `@workspace/design-tokens` — **no NativeWind/Tailwind**. Uses `react-native-gesture-handler`, `react-native-reanimated`, and `expo-secure-store` for auth. Source in `apps/native/src/`; screens in `apps/native/app/`.
- **apps/backend**: Elysia.js API on Bun, Prisma + PostgreSQL, Better Auth (passkeys). Service-layer architecture:
  - `routes/` — HTTP adapters (auth, TypeBox validation, rate limits). Delegate to services.
  - `contracts/` — Service interfaces, DTOs, and cross-cutting policies (e.g. `logging.contract.ts` for log sanitization).
  - `services/` — Business logic, DB access, notifications. Constructor-injected `PrismaClient`.
  - `lib/` — Auth, errors, recurrence, ICS, notification calculator, etc.
- **apps/notifications**: Go service for scheduled email notifications (Resend + HTML templates).

### Shared Packages

| Package                        | Purpose                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@workspace/calendar-client`   | Platform-agnostic HTTP client and typed API service for backend endpoints. Configurable base URL + optional `E2eeProvider`.              |
| `@workspace/calendar-core`     | Shared types, validation, date utilities, view-model helpers, and platform-agnostic logic.                                               |
| `@workspace/design-tokens`     | Colors, spacing, typography, radii, shadows. Web maps these to CSS variables; native uses `ThemeProvider`.                               |
| `@workspace/e2ee`              | E2EE abstraction (AES-GCM-256, RSA-OAEP-4096, HMAC-SHA-256) with platform `CryptoProvider` backends.                                     |
| `@workspace/calendar-ics`      | ICS export and recurrence logic.                                                                                                         |
| `@workspace/ui`                | Shared **web** UI: shadcn components, calendar views, sidebar layout, drawers, dialogs. **Always prefer these over new web primitives.** |
| `@workspace/mobile-ui`         | Legacy `react-native-web` components — **reference only, do not use for new work.**                                                      |
| `@workspace/logger`            | Shared logging utility.                                                                                                                  |
| `@workspace/eslint-config`     | Shared ESLint configuration.                                                                                                             |
| `@workspace/typescript-config` | Shared TypeScript configuration.                                                                                                         |

### Web App Structure

```
apps/web/
├── app/                        # App Router pages (/calendar, /mail, /login, /settings via palette, etc.)
├── components/                 # Feature UI (calendar-manager, event-editor, mail/, command-palette/)
├── hooks/                      # Web-specific React hooks (use-event-form, use-mail-app, …)
└── lib/                        # API clients, auth, route helpers, view models
```

Calendar and mail share the dashboard shell (`AppSidebar`, command palette). Mobile-width web uses responsive drawers — that is **not** a substitute for the native app.

### Native App Structure

```
apps/native/app/
├── _layout.tsx                 # Root providers (Query, Auth, Theme, E2EE, Sidebar, Mail, CommandPalette, …)
├── (auth)/                     # sign-in, sign-up
├── (tabs)/                     # Primary surfaces (tab bar hidden — navigation via sidebar)
│   ├── calendar/               # Calendar views (month/week/day/3day/agenda)
│   └── mail/                   # Mail list, message detail, compose
├── event/                      # Event create, edit, detail
├── calendar-manage/            # Calendar CRUD
├── subscription/               # ICS subscription CRUD
├── settings/                   # Settings + timezone picker
└── +not-found.tsx
```

Reusable native UI: `apps/native/src/components/` (`layout/` — `AppScreen`, `NavigationHeader`, `SurfaceToolbar`; `sheet/`, `event/`, `calendar/`, `mail/`, `AppSidebar`, …). Layout tokens: `apps/native/src/lib/app-layout.ts`.

### Mobile App Context

The native app authenticates with Better Auth (session cookies). Tokens live in `expo-secure-store`. Backend CORS and `TRUSTED_ORIGINS` must include the native origin.

---

## Web and Native Feature Parity (Required)

Solace ships on **web** and **native**. For any **user-facing feature**, update and verify **both** unless the user scopes work to one platform.

### Workflow

1. **Find web code** — `apps/web/components/`, `apps/web/hooks/`, `@workspace/ui`.
2. **Find native code** — matching screen under `apps/native/app/` and components under `apps/native/src/components/`.
3. **Compare behavior** — fields, validation, empty/error/loading states, mutations, edge cases. Capability must match; visual details follow each platform's design system.
4. **Share logic** — types, validation, copy, and helpers in `@workspace/calendar-core` or `@workspace/calendar-client` when both apps need them.
5. **Verify** — `bun run typecheck`, `bun run typecheck:native`, and relevant tests.

If only one platform changes, **say so explicitly** and why.

### Feature map

| Feature area           | Web                                                | Native                                                            |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Calendar views         | `apps/web/app/calendar/`, `@workspace/ui` calendar | `apps/native/app/(tabs)/calendar/`, `src/components/calendar/`    |
| Event create/edit/view | `apps/web/components/event-editor/`                | `src/components/event/` (`EventForm`, `EventSheet`), `app/event/` |
| Mail                   | `apps/web/components/mail/`, `app/mail/`           | `app/(tabs)/mail/`, `src/components/mail/`                        |
| Calendar CRUD          | `apps/web/components/calendar-manager.tsx`         | `app/calendar-manage/`                                            |
| Subscriptions (ICS)    | `apps/web/components/subscription-management.tsx`  | `app/subscription/`                                               |
| Search / quick actions | `apps/web/components/command-palette/`             | `src/components/CommandPalette.tsx`                               |
| Settings               | command palette + `app/settings/` (web)            | `app/settings/`                                                   |
| Auth                   | `apps/web/app/login/`                              | `app/(auth)/`                                                     |

Search both codebases for domain terms (`participants`, `recurrence`, `mailbox`, etc.) before implementing.

### Parity checklist

- [ ] Web updated (including mobile-web drawer/popover where applicable)
- [ ] Native updated
- [ ] Shared packages updated for reused logic/copy
- [ ] `@workspace/calendar-client` consumers updated on both apps if API changed
- [ ] Typecheck passes (web + native)
- [ ] Tests updated where they exist
- [ ] `AGENTS.md` updated if apps, packages, routes, or documented structure changed

---

## UI and Design Consistency (Required)

**Do not introduce generic “AI slop” UI.** New work must look like it shipped with Solace — quiet, warm, and utilitarian. **Before building UI, read the nearest existing screen and match it.**

### Solace design language

- **Warm, restrained palette** — amber/ochre primary (`--primary`), soft neutrals, subtle borders. Defined in `apps/web/app/globals.css` and `@workspace/design-tokens`. **Never** introduce random purple/blue gradients, neon accents, or new palette colors outside tokens/CSS variables.
- **Density over decoration** — tight spacing, clear hierarchy, minimal chrome. No hero cards, oversized rounded corners, or heavy drop shadows unless an adjacent screen already uses them.
- **Subtle motion only** — small fades/slides where the codebase already animates (drawers, popovers). No gratuitous bounce, parallax, or staggered list theatrics.
- **Real copy** — use product-appropriate labels. No lorem ipsum, “Welcome to…”, or marketing filler in functional UI.

### Web rules

1. **Use existing components** from `@workspace/ui/components/ui/*` and `@workspace/ui/components/calendar/*` (`Button`, `Input`, `Drawer`, `Dialog`, `Popover`, `Label`, etc.). Extend variants — don't raw-styled `<div>` buttons.
2. **Use semantic Tailwind tokens** — `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted/30`, `bg-primary/20`. Not hard-coded hex or one-off Tailwind color scales (`bg-zinc-900`, `from-violet-500`).
3. **Icons: `lucide-react` only** (project standard via shadcn). Match size/weight of neighboring icons (`size-4`, `strokeWidth={2.25}` where used nearby).
4. **Follow local patterns** — e.g. event editor toggle pills, drawer shells, `border-border/50` section dividers, `text-sm` form labels, popover info buttons (see `SyncedEventInfoBadge`, `ParticipantsInviteInfo`).
5. **Do not add** new UI libraries, CSS-in-JS, or global style overrides for one feature.

### Native rules

1. **`useTheme()` + `createStyles(theme)`** — co-locate styles at file bottom like existing screens (`settings/index.tsx`, `EventForm.tsx`, `SheetRow.tsx`).
2. **Use design tokens** — `theme.colors.*`, `theme.spacing.*`, `theme.typography.*`, `theme.borderRadius.*`. No magic numbers when a token exists.
3. **Icons: `@expo/vector-icons` Feather** — same set as the rest of the app.
4. **Reuse shell components** — `AppScreen`, `NavigationHeader`, `SurfaceToolbar`, `StackScreenHeader`, `SheetRow`, `SheetList`, `SheetActions`, `BottomSheet`. Layout tokens live in `apps/native/src/lib/app-layout.ts`.
5. **Lists and forms** — hairline dividers (`StyleSheet.hairlineWidth`), 44px touch targets, section labels in `theme.typography.fontSize.sm`. Match `EventForm` toggle pills and settings rows — don't invent new form layouts.
6. **Info/help on native** — tap-triggered `Alert` or sheet (see participants info on `EventForm`). Don't rely on hover.

### Anti-patterns (never do these)

- Gradient backgrounds, glassmorphism blur stacks, or “card inside card inside card” layouts
- Default shadcn/template aesthetics that ignore Solace tokens (generic gray dashboard look)
- New color/spacing systems parallel to design tokens
- Emoji as icons; mixed icon libraries
- One-off components when an existing shared or feature component can be extended
- Desktop-only hover affordances without a tap equivalent on mobile/native

When unsure, **copy structure and classes from the closest existing feature** and change only what the task requires.

---

## Implementation Conventions

- **Minimize scope** — smallest correct diff; match surrounding naming, imports, and abstraction level.
- **Backend changes** — routes stay thin; logic in services; update `contracts/` and `@workspace/calendar-client` together. Route validation schemas and service `I*Service` interfaces live in `apps/backend/contracts/` — ESLint enforces this (see below).
- **Backend logging** — never log PII or user content. Policy lives in `apps/backend/contracts/logging.contract.ts`; apply it via `apps/backend/lib/log-sanitization.ts` (`logRef`, `errorLogDetails`, `sanitizeLogContext`, `redactPII`). Do not duplicate omit/hash key lists elsewhere.
- **Comments** — only for non-obvious business logic.
- **Tests** — add when they cover real behavior; skip trivial assertions.

### Keep AGENTS.md in sync (Required)

`AGENTS.md` is the source of truth for agents working in this repo. **When you change repository structure or architecture, update `AGENTS.md` in the same task** — do not leave it stale.

Update it when you:

- Add, remove, or rename an **app** under `apps/`
- Add, remove, or rename a **workspace package** under `packages/`
- Change **primary routes**, navigation surfaces, or where a major feature lives
- Move or split a feature across directories in a way future agents would need to know
- Change cross-cutting conventions documented here (auth, E2EE, cache mutation rules, design system)

Keep edits factual and concise: architecture bullets, directory trees, shared-packages table, and feature map. Do **not** document one-off scripts or temporary experiments.

### Backend API contracts (types + validation)

HTTP adapters and services share types through `apps/backend/contracts/`:

- **Route schemas** — Zod schemas registered on `routeModels`; routes reference `RouteModel.*` for `body` / `query` / `params` (never inline Zod in `routes/`).
- **Service interfaces** — `I*Service` + input/result types; service classes `implements` the matching contract.
- **Client sync** — when API shapes change, update `contracts/` and `@workspace/calendar-client` together.

**Lint enforcement** (`@workspace/eslint-config/api-contract` in `apps/backend/eslint.config.js`):

- `use-route-model-schemas` — route `body`/`query`/`params` must use `RouteModel.*` from contracts.
- `require-route-models-plugin` — route files using `RouteModel` must `.use(routeModels)` and import from `../contracts`.
- `require-service-contract` — `*Service` classes must `implements I*Service` (internal helpers like `MailSyncService` are allowlisted).
- `no-restricted-imports` — `zod` is banned in `routes/` and `services/` except `contracts/`, `lib/validation.ts`, and `mail-realtime.service.ts` (upstream SSE parsing).

### Backend log sanitization (PII)

Server logs must support debugging **without** storing PII, secrets, or user content (mail bodies, tokens, invite URLs, etc.).

- **Policy (source of truth)**: `apps/backend/contracts/logging.contract.ts` (field keys in `logging.policy.mjs`, shared with ESLint) — `LOG_OMIT_FIELD_KEYS`, `LOG_HASH_FIELD_KEYS`, redaction placeholders, and `LOG_SANITIZATION_POLICY`.
- **Implementation**: `apps/backend/lib/log-sanitization.ts` — always use `logRef`, `errorLogDetails`, `sanitizeLogContext`, `redactPII`, and `sanitizeRequestUrl` when logging errors or context that may contain user data.
- **Lint enforcement**: `apps/backend/eslint.config.js` uses `@workspace/eslint-config/safe-logging` with keys from `logging.policy.mjs`. Rules: `no-raw-error-logging`, `no-sensitive-log-keys`, `no-error-string-in-logs`.
- **New sensitive fields**: add keys to `logging.policy.mjs` first; do not invent parallel omit/hash lists in routes or services.
- **Never log**: raw `Error` objects, stack traces, upstream/JMAP bodies, or Prisma query literals in shared environments.
- **Correlation**: API errors include `requestId` / `x-request-id` for support — log the same id, not raw user identifiers.

### Mail cache mutations (native + web mail)

When mutating mail data already in the React Query cache (star, read state, labels), **use optimistic `onMutate` + `setQueryData`** on the specific list key. Do **not** blanket-invalidate `["mail"]` — that refetches everything, shows spinners, and loses scroll position. Invalidate narrowly on destructive actions (delete, move) where items leave the list. Roll back via refetch/`invalidateMessages()` on failure.

### Calendar timezone handling (native + web)

Calendar UI must use the user's configured timezone as the source of truth for wall-clock dates and times. Do not derive event picker values, calendar day membership, previews, drag/drop targets, date-range fetch bounds, or user-facing event timestamps from the device/browser local timezone. If no user timezone is configured, use `resolveTimezone()` from `@workspace/calendar-core`; the canonical fallback is `Europe/Amsterdam`.

Use shared helpers from `@workspace/calendar-core` for timezone work: validate IANA timezone identifiers with `timezoneSchema`, normalize fallbacks with `resolveTimezone`, convert picker date + `HH:mm` values to UTC with `pickerDateAndTimeToUtc`/`wallClockToUtc`, convert stored UTC instants back to picker dates with `utcToPickerDate`, compute day/week membership with the zoned calendar-day helpers, and format event times with timezone-aware formatters. Avoid `Date#setHours`, `startOfDay`, `isSameDay`, `isToday`, or `date-fns/format` on event times when the result is meant to reflect the user's configured timezone.

Timezone-sensitive API payloads must make timezone explicit in the contract. Event create/update and settings update bodies must use the shared Zod `timezoneSchema` from `@workspace/calendar-core`; do not accept raw `z.string()` for timezone fields. Clients should submit event `start`/`end` as UTC ISO 8601 strings and include the user's resolved timezone when the endpoint persists or interprets wall-clock intent.

---

## Agent Commands (Allowed vs Forbidden)

Agents may run **verification and setup** commands only. **Do not start dev servers, production builds, tunnels, or native release builds** unless the user explicitly asks.

### Common commands (from repo root unless noted)

- **Install dependencies**: `bun run install:all`, or `bun install` in the relevant app/package
- **Lint**: `bun run lint`, `bun run lint:react-doctor`
- **Typecheck**: `bun run typecheck`, `bun run typecheck:native`
- **Tests**: `bun run test`, or scoped runs (`test:backend`, `test:native`, `test:ui`, `test:notifications`) and single-file test paths
- **Prisma client** (after schema changes, in `apps/backend`): `bun run db:generate`
