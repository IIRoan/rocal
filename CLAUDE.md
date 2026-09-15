# Solace — Agent Rules

`AGENTS.md` and `CLAUDE.md` are **identical inline copies** (same in `apps/web/`). Edit one, copy it to the other; `bun run lint` fails if they drift. Rules marked **MUST** are non-negotiable; `scripts/check-repo-rules.ts` enforces the mechanical ones.

Solace is a privacy-first calendar + mail app. Bun workspaces monorepo.

## 1. Map

| Path                  | What                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web`            | Next.js 16 App Router, React 19, Tailwind v4, shadcn (new-york). Vercel. Routes `/calendar`, `/mail`, `/login`; settings live in the command palette. Read `apps/web/AGENTS.md` (Next.js APIs differ from training data). |
| `apps/native`         | Expo SDK 57 / RN 0.86, Expo Router (`app/`), source in `src/`. `StyleSheet` + `useTheme()`, **no NativeWind**. Auth in `expo-secure-store`. OTA only via `bun run update:*`. |
| `apps/backend`        | Elysia 2 on Bun, Prisma + Postgres (Railway), Better Auth (passkeys). Vercel. `routes/` → `contracts/` → `services/` → `lib/`.            |
| `apps/notifications`  | Go worker: Postgres outbox → noreply mail via Stalwart JMAP + APNs push. Never reads user mailboxes. Reminder mail/push and new-mail push are generic; the iOS Notification Service Extension (`apps/native/plugins/notification-service-extension`) decrypts the reminder title / fetches sender+subject on-device. |
| `apps/stalwart`       | Stalwart mail server, JMAP desired-state plan, VPS HAProxy/frp (`vps/README.md`). Deploy VPS scripts → Railway image → Gatus.             |
| `apps/gatus`, `apps/errex` | Status page; self-hosted Sentry-compatible error tracker. Railway IaC in `.railway/railway.ts` (web + API stay on Vercel).           |
| `packages/calendar-core`   | Shared types, Zod schemas, date/timezone helpers, search index, sanitizers — **all logic both apps need goes here**.               |
| `packages/calendar-client` | Typed HTTP client for the backend (used by web and native).                                                                       |
| `packages/e2ee`            | E2EE primitives (AES-GCM-256, RSA-OAEP-4096, HMAC-SHA-256) with platform crypto providers.                                        |
| `packages/ui`, `design-tokens` | Shared web UI (shadcn + calendar views); tokens for web CSS vars and native `ThemeProvider`.                                  |
| `packages/calendar-ics`, `logger`, `eslint-config`, `typescript-config`, `runtime` | ICS/recurrence, logging, lint rules, TS configs, runtime helpers.                     |
| `packages/mobile-ui`       | **Legacy, unused.** Never import (enforced). Delete rather than extend.                                                           |
| `webmail/`                 | Untracked third-party Bulwark (AGPL) reference. Never copy code from it, never commit it.                                         |

## 2. Privacy & security by design (MUST)

Default stance: **the server should not be able to read user content, and we should not store anything we don't need.** Every change is reviewed against this.

**Data minimization**
- Before adding a field, column, log key, or payload property that holds PII or user content, ask: can it be E2EE, hashed, derived on-device, or dropped? Plaintext is the last resort and must be justified in the PR.
- User content (event title/description/location, calendar/category names, contacts, mail) is encrypted client-side with `@workspace/e2ee`; search uses blind-index tokens. **Never add a server-side plaintext copy, catalog, or search index.** Title search stays on-device (`title-search-index` in `calendar-core`).
- Clients must not send plaintext fields the server is going to discard — send ciphertext only. The API rejects plaintext event content or names sent alongside ciphertext; build payloads with `encryptEventContentRequest`/`encryptNameRequest` (`@workspace/e2ee`). Invitation mail is the one exception: a transient `invitationContent` copy, never persisted.
- No third-party analytics, session replay, ad or tracking SDKs (enforced). Error reporting goes only to self-hosted Errex with `sendDefaultPii: false` (enforced).
- Do not persist the TanStack Query cache (enforced). Anything written to disk (drafts, keys, caches) is encrypted or in `expo-secure-store` / memory, and cleared on sign-out.
- New tables with PII or ephemeral data MUST define retention (TTL cleanup job) and be covered by account deletion (`services/account.service.ts`).
- TTL cleanup runs hourly in the notifications worker: add a rule and named window to `apps/notifications/internal/retention/retention.go` (windows listed in `apps/notifications/README.md`).
- Don't collect IPs/user agents beyond what auth strictly needs. Sessions never store IP/user agent (`stripSessionClientMetadata` hook); the client IP is only used in memory to key rate limits, stored HMACed in `rate_limit`.
- No PII in URLs, query strings, route params, push payloads, or cache keys (use opaque ids). Push content is resolved on-device by the NSE: reminder titles are `encryptedDisplayTitle` (`@workspace/e2ee` `notification-title`), mail pushes carry only `emailId`/`accountId`. The NSE reads secrets only from the App Group keychain (`src/lib/notification-extension-store.ts`, cleared on sign-out).

**Logging & error reporting**
- Backend: never log PII, user content, tokens, URLs with secrets, raw `Error`s, stacks, upstream/JMAP/Prisma bodies. Use `lib/log-sanitization.ts` (`logRef`, `errorLogDetails`, `sanitizeLogContext`, `redactPII`, `sanitizeRequestUrl`). New sensitive keys go into `packages/calendar-core/src/redaction-policy.js` first (re-exported by `contracts/logging.policy.mjs`) — no parallel lists. Enforced by `safe-logging/*` lint rules.
- Correlate with `requestId` / `x-request-id`, never with user identifiers.
- Web/native: no `console.*` of user data; error reports must go through `@workspace/calendar-core/report-redaction` (`scrubErrorEvent`/`scrubBreadcrumb`, same keys as backend logs) before leaving the device.

**Secure coding**
- Validate every input at the boundary with Zod (strict objects). Treat JMAP, ICS, webhooks, and mail HTML as hostile.
- Mail HTML: always sanitize, render in a sandboxed iframe **without scripts**, block remote content by default.
- Outbound fetches to user-supplied URLs go through `lib/safe-fetch.ts` (address check inside the connect-time DNS lookup, so no rebinding; manual re-validated redirects, timeout, size cap). Never call `fetch` on a user URL.
- Webhooks verify HMAC with `timingSafeEqual` and reject when the secret is unset.
- Secrets: only in env/EAS/Railway/Vercel. Never commit `.env` (only `*.example`), keys (`.p8`, `.pem`), or tokens (enforced). No insecure fallbacks for secrets in production — fail fast. `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values are public; never put secrets there.
- Authz on every route: resolve the session, then scope every query by owner/share. Never trust client-supplied user ids. Rate-limit auth and public endpoints.
- New deps: prefer none. Justify each one (maintenance, size, supply chain); no postinstall-heavy or unmaintained packages.

**Known gaps — fix when you touch the area, never widen:** legacy plaintext calendar/category names stay on the server until a signed-in device runs the name backfill (`backfillEncryptedNames`; subscription feed names and the `Invitations` staging label stay plaintext by design); PII in URLs: `GET /api/profiles/avatar` takes an email and `GET /api/events/search` a plaintext `q`; the iOS NSE holds the full session cookie instead of a scoped push-fetch token; avatar fetches follow https→http redirects.

**Accepted trade-off (decided):** `EventParticipant` email/display name stay plaintext server-side — invites (iMIP via Stalwart) and RSVP matching require them. Never log them, never copy them elsewhere.

## 3. API contract (MUST)

- **Zod is the only validation library** (enforced). Schemas live in `apps/backend/contracts/*.contract.ts` or, when clients also need them, `packages/calendar-core` (`route-schemas.ts`) and are imported by contracts.
- Routes are thin: auth → `RouteModel.*` validation → service call → response. No inline Zod, no Prisma, no business logic in `routes/`. Services `implements I*Service` from `contracts/`. Enforced by `api-contract/*` lint rules.
- One change = contract + service + `@workspace/calendar-client` + both app consumers, in the same PR. Response types come from shared types/schemas — never hand-write a divergent client copy.
- Errors use the envelope in `lib/errors.ts` (`{ error, message, statusCode, details?, requestId, timestamp }`). Never leak internals or user content in `message`/`details`.
- Breaking changes must stay compatible with the **shipped native binary/OTA** (additive fields, optional new inputs, deprecate before removing).
- Timezone-bearing payloads use `timezoneSchema`; instants are UTC ISO 8601.
- HTTP from apps goes through `@workspace/calendar-client` (no axios/ky; enforced). `apps/web/lib/*-api-service.ts` re-exports are deprecated — import the package.

## 4. Data layer: TanStack Query (MUST)

- Server state lives in TanStack Query; UI state in local state or React Context. **No other state library** (enforced).
- **Query keys come from a factory, never inline arrays.** Native: `apps/native/src/lib/query-keys.ts`; web mail: `apps/web/lib/mail/mail-query-keys.ts`. New keys go in a factory; migrate inline `["events"]`-style keys when you touch them. Keys shared across apps belong in `calendar-core` (like `PUSH_DEVICES_QUERY_KEY`). Same data = same key name on both platforms.
- `useQuery`/`useMutation` live in domain hooks (`use-*.ts`), not directly in screens/components. Components consume hooks.
- No `useEffect` + `fetch`/`setState` for server data; no copying query data into state.
- Mutations on cached data: optimistic `onMutate` + `setQueryData` on the precise key, rollback on error, narrow `invalidateQueries` on settle. Never blanket-invalidate a root key (`["mail"]`, `["events"]`) — it refetches everything and loses scroll. Destructive moves/deletes may invalidate the affected list.
- Decrypted content in the cache is cleared on sign-out/account switch (`queryClient.clear()`).
- `enabled` guards for missing ids/sessions/keys; `select` for derived data; no `any` query types.

## 5. Code quality (MUST)

- **TypeScript strict.** No new `any`, `as unknown as`, `@ts-ignore`, or non-null `!` without a comment explaining why. `apps/web` still has `strict: false` — code you touch must compile under strict; don't add to the debt.
- **Share, don't duplicate.** Web and native currently duplicate `lib/mail/*` (JMAP client, message security, threads, invites), `use-recent-contacts`, `use-mail-calendar-invitation`, etc. New platform-agnostic logic MUST go in `packages/*`; when changing a duplicated file, fix both copies and prefer extracting it to a package.
- Smallest correct diff; match surrounding naming, imports, and abstractions. No speculative abstractions, no dead code, no commented-out code, no TODOs without an owner/issue.
- Pure logic out of components (hooks/`lib`), components small; follow React Doctor (runs as a hook on edits, blocking on warnings). Fix findings in files you touch instead of adding ignores to `react-doctor.config.json`.
- Comments only for non-obvious business rules or security reasoning.
- Tests: add/adjust tests for real behavior, especially security boundaries (authz, sanitization, crypto, SSRF, log redaction) and bug fixes (regression test first). Jest everywhere; Go `go test` in notifications.
- Dates/timezones: user's configured timezone is the source of truth (fallback `resolveTimezone()` → `Europe/Amsterdam`). Use `calendar-core` helpers (`wallClockToUtc`, `utcToPickerDate`, zoned day helpers); never `setHours`/`startOfDay`/`isToday`/`date-fns/format` on event times. No moment/dayjs/luxon (enforced).

## 6. Web ↔ native feature parity (MUST)

Every user-facing feature ships on **web and native in the same change** with the same capability (fields, validation, loading/empty/error states, edge cases); visuals follow each platform. A single-platform change must say so explicitly in the PR with the reason and a follow-up issue. Mobile-width web is not a substitute for native.

| Feature              | Web                                              | Native                                              |
| -------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Calendar views       | `app/calendar/`, `@workspace/ui` calendar        | `app/(tabs)/calendar/`, `src/components/calendar/`  |
| Event create/edit    | `components/event-editor/`                       | `src/components/event/`, `app/event/`               |
| Mail                 | `components/mail/`, `app/mail/`                  | `app/(tabs)/mail/`, `src/components/mail/`          |
| Calendars / ICS subs | `components/calendar-manager.tsx`, `subscription-management.tsx` | `app/calendar-manage/`, `app/subscription/` |
| Search / actions     | `components/command-palette/`                    | `src/components/CommandPalette.tsx`                 |
| Settings             | command palette                                  | `app/settings/`                                     |
| Auth                 | `app/login/`                                     | `app/(auth)/`                                       |

Checklist: web updated · native updated · shared logic in `packages/*` · client + both consumers updated for API changes · `bun run typecheck` + `typecheck:native` + tests pass · this file updated if structure changed. Push notifications are iOS-only by design (settings still round-trip on web).

## 7. UI

Look like Solace: quiet, warm, dense, utilitarian. Copy the nearest existing screen before building.
- Tokens only: web semantic Tailwind (`bg-background`, `text-muted-foreground`, `border-border`) from `globals.css`; native `theme.colors/spacing/typography/borderRadius`. No hex, no raw color scales, no gradients, glassmorphism, neon, nested cards, heavy shadows.
- Components: web `@workspace/ui` (extend variants, no raw-div buttons); native `AppScreen`, `NavigationHeader`, `SheetRow`, `BottomSheet`, `createStyles(theme)` at file bottom.
- Icons: web `lucide-react`, native Feather. No emoji icons, no mixed sets.
- No press-scale/dent (`active:scale-*`, `whileTap`); feedback via color/opacity. `cursor-pointer` on web clickables. 44px touch targets, tap equivalents for hover affordances.
- Subtle motion only; real product copy; no new UI/CSS-in-JS libraries.

## 8. Mail: JMAP only (MUST)

All mailbox operations use JMAP: clients via `StalwartJmapClient` (web + native `lib/mail/jmap-client.ts`), backend via the proxy in `routes/mail.ts`, admin via `lib/stalwart-admin.ts`, internal delivery via `Email/import`. Extend existing method builders (`buildSendMessageMethodCalls`, …). **No IMAP/POP3/SMTP clients, no alternate mail APIs** (enforced). App mail (auth, invites, reminders) is sent as the noreply identity over JMAP — no Resend/SMTP. Inbound-mail push is enqueued only from the HMAC-signed Stalwart webhook (`POST /api/internal/stalwart/webhook`).

## 9. Commands

Verify only — **don't start dev servers, builds, tunnels, EAS builds, OTA publishes, or `railway` applies unless asked.**

- `bun run lint` — repo rules + backend, web, native, notifications lint
- `bun run typecheck` / `bun run typecheck:native`
- `bun run test` (or `test:backend|native|ui|notifications`, single file paths)
- `bun run lint:react-doctor`; Prisma: `cd apps/backend && bun run db:generate`

CI (`.github/workflows/pr-tests.yml`) runs lint, both typechecks, and tests on every PR.

## 10. Keep this file true

Update both copies in the same change when you add/rename an app or package, move a feature, change routes, or change a convention here (auth, E2EE, privacy, API contract, data layer, mail). When a known gap is fixed, delete it from §2. When a rule becomes mechanically checkable, add it to `scripts/check-repo-rules.ts`. Keep it concise — no one-off scripts or experiments.
