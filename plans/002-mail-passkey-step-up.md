# Plan 002: Apply passkey step-up to mail secrets routes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 92d2488..HEAD -- apps/backend/routes/mail.ts apps/backend/__tests__/routes/`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `92d2488`, 2026-06-10

## Why this matters

Accounts with registered passkeys require step-up verification via `requireAuth` (`lib/auth-guard.ts:66-87`). Mail routes `/mail/oauth/access-token` and `/mail/vault-key-material` call `auth.api.getSession` directly, bypassing passkey enforcement. A stolen session cookie can obtain mail OAuth tokens and vault key material without passkey verification.

## Current state

- `apps/backend/routes/mail.ts` — mail routes; sensitive handlers at lines 351-428 use manual `getSession`.
- `apps/backend/lib/auth-guard.ts` — `requireAuth` plugin with passkey step-up `onBeforeHandle`.
- `apps/backend/routes/mail-account.ts:84` — exemplar: `.use(requireAuth)` then handlers use `authenticatedUser`.

Sensitive routes today:

```351:364:apps/backend/routes/mail.ts
    .get(
      "/oauth/access-token",
      async ({ request, set }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        const userId = session?.session?.userId;
        const email = session?.user?.email?.trim();
        if (!userId || !email) {
          set.status = 401;
          ...
```

```391:402:apps/backend/routes/mail.ts
    .get(
      "/vault-key-material",
      async ({ request, set }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.session?.userId) {
          set.status = 401;
          ...
```

`/mail/config` and JMAP proxy routes should remain usable without step-up where they already are public or separately authorized.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd apps/backend && bun run typecheck` | exit 0 |
| Auth guard tests | `cd apps/backend && bun run test -- __tests__/lib/auth-guard.test.ts` | all pass |
| Mail route tests | `cd apps/backend && bun run test -- __tests__/routes/mail-account.test.ts` | all pass |
| Full backend | `cd /var/home/roan/Documents/rocal && bun run test:backend` | all pass |

## Scope

**In scope**:
- `apps/backend/routes/mail.ts`
- `apps/backend/__tests__/routes/mail-routes.test.ts` (create if missing; or extend nearest mail route test file)

**Out of scope**:
- Removing `derivedKeyB64` from vault response (separate product/security decision)
- Native/web client passkey UX changes
- `lib/auth-guard.ts` behavior changes

## Git workflow

- Branch: `advisor/002-mail-passkey-step-up`
- Commit message: `fix: require passkey step-up for mail token and vault routes`

## Steps

### Step 1: Restructure mail routes with `requireAuth` group

In `createMailRoutes`, keep public endpoints (`/config`, JMAP proxy) **before** auth.

Add import:

```typescript
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
```

After public routes, chain:

```typescript
.use(requireAuth)
.guard({ as: "scoped" }, (app) =>
  app
    .get("/oauth/access-token", async ({ authenticatedUser, set }) => {
      const userId = authenticatedUser?.id;
      const email = authenticatedUser?.email?.trim();
      if (!userId || !email) {
        set.status = 401;
        return { error: "Unauthorized", message: "...", statusCode: 401 };
      }
      // existing mailService.issueAccessTokenForUser body
    })
    .get("/vault-key-material", async ({ authenticatedUser, set }) => {
      const userId = authenticatedUser?.id;
      if (!userId) { ... }
      // existing deriveVaultKeyMaterial / deriveVaultKeyForNative body using userId
    })
    // move any other session-gated mail routes here
)
```

Remove direct `auth.api.getSession` calls from moved handlers. `requireAuth` throws `UnauthorizedError` / `ForbiddenError` for missing session or missing step-up — ensure error handling matches other routes (check `lib/errors.ts` global handler if present).

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 2: Add route-level test for step-up enforcement

Create `apps/backend/__tests__/routes/mail-routes.test.ts` (or extend an existing mail routes test).

Pattern from `__tests__/lib/auth-guard.test.ts` and `__tests__/routes/mail-account.test.ts`:

1. Mock `requireAuth` to propagate `ForbiddenError` when passkey step-up required **OR** use real `requireAuth` with mocked `getPasskeyStepUpStatus` returning `requiresPasskeyStepUp: true`.
2. Call `createMailRoutes(mockMailService).handle(new Request("http://localhost/mail/vault-key-material"))` with session headers.
3. Expect 403 (or whatever `ForbiddenError` maps to).

Also test happy path with step-up satisfied returns 200 shape.

**Verify**: `cd apps/backend && bun run test -- __tests__/routes/mail-routes.test.ts` → pass

### Step 3: Smoke full suite

**Verify**: `cd /var/home/roan/Documents/rocal && bun run test:backend` → exit 0

## Test plan

- New file `__tests__/routes/mail-routes.test.ts` with at least 2 cases: step-up required → forbidden; step-up satisfied → vault/oauth handler invoked.
- Model Elysia `.handle()` pattern from `__tests__/routes/events.test.ts`.

## Done criteria

- [ ] `/mail/oauth/access-token` and `/mail/vault-key-material` mounted under `requireAuth`
- [ ] No direct `auth.api.getSession` in those handlers
- [ ] Route test proves passkey step-up blocks access
- [ ] `bun run typecheck` and `bun run test:backend` exit 0
- [ ] `plans/README.md` updated

## STOP conditions

- Restructuring breaks JMAP proxy routes or `/mail/config` (public access regresses) — revert grouping approach and use per-route `.use(requireAuth)` only on the two endpoints.
- `ForbiddenError` is not mapped to HTTP 403 in the Elysia app — report actual status code and adjust test expectations to match global error plugin.
- Handlers cannot access `authenticatedUser.email` — check `auth-guard` derive shape vs session user fields.

## Maintenance notes

- Any new mail route returning secrets or OAuth tokens must use `requireAuth`, not raw `getSession`.
- Native mail bootstrap must complete passkey step-up before calling vault/oauth endpoints — flag for manual QA on iOS/Android after deploy.
