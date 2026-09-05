# Agent Instructions

This repository is a monorepo for **Solace** — a calendar and mail application — containing a web frontend, a native mobile app, a backend API, a notifications service, the Stalwart mail stack, Gatus status page, and shared packages, structured using Bun workspaces (`apps/web`, `apps/native`, `apps/backend`, `apps/notifications`, `packages/*`). `apps/stalwart` and `apps/gatus` are Docker/config apps, not Bun packages.

## High-Level Architecture

- **apps/web**: Next.js App Router frontend (React 19, Tailwind CSS v4, shadcn/ui **new-york** style). Deployed on **Vercel** (`apps/web/vercel.json`, Bun install from monorepo root; Cache Components + Partial Prefetching). Primary routes: `/calendar`, `/mail`, `/login`. Feature code lives in `apps/web/components/`, `apps/web/hooks/`, and `apps/web/lib/`. Uses `@workspace/ui` for shared web/calendar UI, plus `@workspace/calendar-client`, `@workspace/calendar-core`, `@workspace/design-tokens`, and `@workspace/e2ee`. Calendar and mail still load user data on the client via React Query.
- **apps/native**: Expo React Native app (SDK 57, React Native 0.86, React 19.2). File-based routing via Expo Router. Styling is **`StyleSheet.create()` + `useTheme()`** from `@workspace/design-tokens` — **no NativeWind/Tailwind**. Uses `react-native-gesture-handler`, `react-native-reanimated` 4, `react-native-worklets`, and `expo-secure-store` for auth. iOS lock-screen alerts use **`expo-notifications` + `getDevicePushTokenAsync()`** (raw APNs token via `PUT /api/push/devices`, not Expo Push). Enable Push Notifications on both App IDs, store the APNs `.p8` in EAS/Railway (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY`) — never commit the key. New EAS iOS builds are required after the entitlement changes. Native WebCrypto/OpenPGP/mail-vault crypto is `react-native-quick-crypto`, installed from `apps/native/index.js` before Expo Router loads. Source in `apps/native/src/`; screens in `apps/native/app/`. EAS `APP_VARIANT=development` produces a separate **Solace Dev** binary (`.dev` bundle ID + DEV icon). EAS iOS builds use the `sdk-57` image. Git `main`/`master` publishes the `preview` update channel, git `testing` publishes `development`, and git `master` also publishes production (`master`).
- **apps/backend**: Elysia 2 API on **Bun** (local + Vercel `bunVersion`). Prisma + PostgreSQL, Better Auth (passkeys). Vercel: `app.ts` → Bun-bundled `main.ts` (`bun run build:vercel`); Prisma `rhel-openssl-3.0.x` engines copied beside the bundle. Local/dev: `serve.ts`. Optional AOT binary: `bun run build:binary` → `./server`. Postgres on Railway — Vercel `DATABASE_URL` must be the public proxy (`*.proxy.rlwy.net`), not `postgres.railway.internal`. Better Auth is wired as native `.all()` routes (AOT cannot compile `.mount()`). Service-layer architecture:
  - `routes/` — HTTP adapters (auth, TypeBox validation, rate limits). Delegate to services.
  - `contracts/` — Service interfaces, DTOs, and cross-cutting policies (e.g. `logging.contract.ts` for log sanitization).
  - `services/` — Business logic, DB access, notifications. Constructor-injected `PrismaClient`.
  - `lib/` — Auth, errors, recurrence, ICS, notification calculator, etc.
- **apps/stalwart**: Stalwart mail server (Docker image + `railway-entrypoint.sh`), desired-state JMAP plan (`stalwart/plan/`), and VPS HAProxy/frp/Postfix (`vps/`). Clients still access mail **only via JMAP**. Railway builds with `rootDirectory: apps/stalwart`. `frpc-supervisor.py` owns the slot/relay children and live health snapshot; after promotion and the health gate it claims a **warm standby frpc** on the vacated slot. Slot-manager protocol v2 uses expiring owner-scoped preempt requests and leases: reserve before launch, stop before release acknowledgement, never bind an occupied/unknown slot. Roles follow the VPS active slot after watcher failover. Deploy VPS scripts before the Railway image, then Gatus. Protected `master` merges of allowlisted `apps/stalwart/vps/` files auto-deploy via `.github/workflows/sync-mail-vps.yml` (Environment `mail-vps`). See `apps/stalwart/vps/README.md`.
- **apps/gatus**: Status page (`status.solace.onl`). Separate Railway service from mail; built with `rootDirectory: apps/gatus`.
- **apps/notifications**: Go dispatcher. Polls Postgres every 5s (`event_notification` schedules fan out into a `notification_job` outbox). Mail jobs are claimed even if reminder `ClaimDue` fails. **Email** is Stalwart JMAP `Email/set` + `EmailSubmission/set` as the noreply identity (Railway Hobby cannot SMTP). **Push** is APNs HTTP/2 with a 2-minute claim lease, exponential backoff, and a max of 8 attempts. Reminder alerts use `event_notification.display_title` (captured when the user sets a reminder). New-mail alerts use sender display name + subject. The worker does **not** JMAP-read user mailboxes. Inbound mail push jobs are enqueued by the backend from Stalwart telemetry webhooks (`message-ingest.ham` on `POST /api/internal/stalwart/webhook`). Local `go run ./` loads `.env` from cwd, then walks up and falls back to `apps/backend/.env` (existing process env still wins).
- **Railway**: mail (Stalwart), notifications, Gatus, and Postgres are defined in `.railway/railway.ts`. Web + API are on Vercel — do not re-add them to Railway IaC. Preview with `railway config plan`; apply only when asked.

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
│   ├── calendar/               # Calendar views (month/week/day/3day/agenda; day/3-day/week use @howljs/calendar-kit)
│   └── mail/                   # Mail list, message detail, compose
├── event/                      # Event create, edit, detail
├── calendar-manage/            # Calendar CRUD
├── subscription/               # ICS subscription CRUD
├── settings/                   # Settings hub + account, appearance, calendar, mail, time-region, notifications, security
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

| Feature area           | Web                                                | Native                                                                                                                          |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Calendar views         | `apps/web/app/calendar/`, `@workspace/ui` calendar | `apps/native/app/(tabs)/calendar/`, `src/components/calendar/` (day/3-day/week via `@howljs/calendar-kit`; month/agenda custom) |
| Event create/edit/view | `apps/web/components/event-editor/`                | `src/components/event/` (`EventForm`, `EventSheet`), `app/event/`                                                               |
| Mail                   | `apps/web/components/mail/`, `app/mail/`           | `app/(tabs)/mail/`, `src/components/mail/`                                                                                      |
| Calendar CRUD          | `apps/web/components/calendar-manager.tsx`         | `app/calendar-manage/`                                                                                                          |
| Subscriptions (ICS)    | `apps/web/components/subscription-management.tsx`  | `app/subscription/`                                                                                                             |
| Search / quick actions | `apps/web/components/command-palette/`             | `src/components/CommandPalette.tsx`                                                                                             |
| Settings               | command palette (`/settings` redirects into it)    | `app/settings/` hub + sub-pages                                                                                     |
| Auth                   | `apps/web/app/login/`                              | `app/(auth)/`                                                                                                                   |

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
- **No press-scale / indent** — never shrink, scale down, translate inward, or inset-shadow “dent” controls on `:active` / press (`active:scale-*`, `scale: 0.9x`, `whileTap` scale, global button press transforms). Click feedback is color/background/opacity only. Hover may brighten or lift slightly; press must not squash the control.
- **Pointer cursor on clickables** — interactive controls (`button`, links, `[role="button"]`, clickable rows) must show `cursor-pointer` (disabled → `not-allowed`). Do not leave the default arrow on clickable UI.
- **Real copy** — use product-appropriate labels. No lorem ipsum, “Welcome to…”, or marketing filler in functional UI.

### Web rules

1. **Use existing components** from `@workspace/ui/components/ui/*` and `@workspace/ui/components/calendar/*` (`Button`, `Input`, `Drawer`, `Dialog`, `Popover`, `Label`, etc.). Extend variants — don't raw-styled `<div>` buttons.
2. **Use semantic Tailwind tokens** — `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted/30`, `bg-primary/20`. Not hard-coded hex or one-off Tailwind color scales (`bg-zinc-900`, `from-violet-500`).
3. **Icons: `lucide-react` only** (project standard via shadcn). Match size/weight of neighboring icons (`size-4`, `strokeWidth={2.25}` where used nearby).
4. **Follow local patterns** — e.g. event editor toggle pills, drawer shells, `border-border/50` section dividers, `text-sm` form labels, popover info buttons (see `SyncedEventInfoBadge`, `ParticipantsInviteInfo`).
5. **Do not add** new UI libraries, CSS-in-JS, or global style overrides for one feature.
6. **No press indent** — do not add `active:scale-*`, press `transform`/`scale`, or inset active shadows that make controls dent in. Prefer `cursor-pointer` + color/hover feedback.

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
- Press-scale / “dent in” on click (`active:scale-*`, global `button:active { scale }`, inset press shadows)
- Missing `cursor-pointer` on clickable web controls

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
- Change cross-cutting conventions documented here (auth, E2EE, cache mutation rules, design system, **mail/JMAP protocol**)

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

**Private title index (web + native).** Older mail and calendar search uses an on-device AES-GCM title index (`title-search-index` + `search-index-crypto` in `@workspace/calendar-core`). Hydrated event titles and mail subjects stay on the device and are not uploaded. Encrypted event ciphertext stays on the server and is still found via blind-index tokens. Do not add a server-side plaintext title catalog.

### Mail protocol: JMAP only (Required)

Solace mail is **JMAP end-to-end**. Agents must use **JMAP as the only protocol** for mailbox operations — never introduce or wire up parallel mail stacks.

**Use JMAP for all mailbox work:**

- **Web and native clients** — `StalwartJmapClient` (`apps/web/lib/mail/jmap-client.ts`, `apps/native/src/lib/mail/jmap-client.ts`): session discovery, `Email/*`, `Mailbox/*`, `Thread/*`, `Identity/*`, `EmailSubmission/set`, blob upload/download, and Stalwart JMAP extensions (`x:AccountSettings/*`, `x:Email/*`, `x:Jmap/*`).
- **Backend user mail** — JMAP proxy and OAuth bridge in `apps/backend/routes/mail.ts`; sync/realtime via JMAP `*/changes` in `mail-sync.service.ts` and `mail-realtime.service.ts`.
- **Backend provisioning and admin** — Stalwart registry/admin **via JMAP** in `apps/backend/lib/stalwart-admin.ts` (not a separate mail REST API).
- **Server-delivered mail to a Solace inbox** — JMAP blob upload + `Email/import` in `apps/backend/lib/internal-mailbox-delivery.ts`.

**Forbidden — do not add or use:**

- **IMAP, POP3, or SMTP client code** in apps or shared packages (no `node-imap`, `nodemailer` transport to the mailbox server, direct SMTP submission from web/native, etc.).
- **Alternate mail HTTP APIs** or proprietary sync layers alongside JMAP.
- **New mail clients** that bypass `StalwartJmapClient` / the backend JMAP proxy.
- **Legacy or reference trees** (e.g. `webmail/`) as patterns for new Solace mail work — extend the JMAP clients above instead.

**Outbound delivery:** clients submit with `Email/set` + `EmailSubmission/set` over JMAP. Stalwart relays to external recipients over SMTP on the server side — apps do **not** speak SMTP.

**Outbound app mail (noreply identity):** Better Auth mail, calendar share invites, external event-invitation fallback, and reminder mail all submit over Stalwart JMAP as a dedicated mailbox (`STALWART_JMAP_URL` / `STALWART_JMAP_USERNAME` / `STALWART_JMAP_PASSWORD` + `EMAIL_FROM`). Do **not** use Resend or SMTP from Railway or the Go worker. Internal Solace inboxes still receive invitations via JMAP import (`internal-mailbox-delivery.ts`), not a round-trip through public SMTP.

**Push notifications (native iOS only):** `PushDevice` stores APNs tokens. Event reminder jobs may include a captured `title` (from `event_notification.display_title`). New-mail jobs may include JMAP `fromName` + `subject` for a single inbound message. Sending mail does not notify the sender. Web has no Web Push; `UserSettings.pushNotifications` still round-trips so iPhone delivery can be toggled from either client. Settings → Notifications lists registered devices via `GET /api/push/devices` (tokens are never returned). Inbound mail push is enqueued exclusively from Stalwart telemetry webhooks (`message-ingest.ham` → `POST /api/internal/stalwart/webhook`, HMAC-signed with `STALWART_WEBHOOK_SECRET`). Stalwart webhook config is declared in `apps/stalwart/stalwart/plan/40-integrations.ndjson` (applied on mail-server boot); the backend also upserts the webhook on startup via `x:WebHook/set` + `ReloadSettings` when both `STALWART_WEBHOOK_SECRET` and `STALWART_ADMIN_TOKEN` are configured. `MailRealtimeService` and `GET /mail/sync` remain for client mail refresh only; they do not enqueue push jobs. The Go worker does not read user mailboxes.

**Not user-mailbox JMAP (allowed, separate concern):**

- `apps/notifications` — reminder **email** as the noreply identity, plus APNs for lock-screen alerts. Reminder emails and lock-screen alerts use `event_notification.display_title` (captured when the user sets a reminder). Do not poll user Inboxes from Go; new-mail push is enqueued by the backend Stalwart webhook handler and may include the sender display name and JMAP subject for a single inbound message.
- Auth/system email helpers — transactional only; not mailbox read/write.

When implementing mail features, search for existing JMAP method builders (`buildSendMessageMethodCalls`, `buildDraftMethodCalls`, etc.) and extend them rather than inventing a new transport.

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
