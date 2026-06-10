# Plan 012: Parallelize and cache the mail startup fetch chain

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/hooks/use-mail-app.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (do BEFORE Plan 014, which restructures the same hook — coordinate in the index)
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

The app is a static export — there is no server-rendered data. Opening `/mail` therefore pays a fully client-side chain before any message renders: dynamic chunk load → session check → `getConfig` (effect 1, sets state) → `getAccountStatus` (effect 2, sets state) → auto-sign-in effect fires only when both states are populated → `handleSignIn` (key material, JMAP session, vault) → inbox fetch. `getConfig` and `getAccountStatus` are independent of each other but serialized through separate effect→setState→effect hops, and neither result is cached, so every remount of the mail surface repeats both round-trips. Removing one round-trip from the critical path and caching both is a visible first-paint win for mail.

## Current state

- `apps/web/hooks/use-mail-app.ts` (2,589 lines) — the relevant pieces:

```ts
// :706-723 — Load config (effect, runs once)
useEffect(() => {
  let cancelled = false;
  void mailDemoApiService
    .getConfig()
    .then((nextConfig) => {
      if (!cancelled) setConfig(nextConfig);
    })
    .catch((error) => { ... toast.error("Could not load the mail configuration."); });
  return () => { cancelled = true; };
}, []);

// :725-765 — Load mailbox status (separate effect, keyed on account identity)
useEffect(() => {
  let cancelled = false;
  if (!accountEmail || !accountUserId) { /* clears status */ }
  ...
  void mailDemoApiService
    .getAccountStatus()
    .then((status) => { if (!cancelled) setMailboxStatus(status); })
    ...
}, [accountEmail, accountUserId]);

// :1393-1412 — auto sign-in gate
useEffect(() => {
  if (!config || !session?.user || isSessionPending || isMailboxStatusLoading ||
      isBusy || activeMailbox || !mailboxStatus || hasAttemptedAutoOpenRef.current)
    return;
  hasAttemptedAutoOpenRef.current = true;
  void handleSignIn();
}, [...]);
```

- `handleSignIn` (`:1193-1391`) is already internally parallel (`Promise.all` with `client.discoverSession()` at :1238/:1253) — do NOT restructure it.
- React Query is available and used elsewhere in this hook (`queryClient` is in `handleSignIn`'s dep array). Query conventions: see `apps/web/lib/mail/mail-query-keys.ts` for the mail key factory — add the new keys there.
- `mailDemoApiService` lives at `apps/web/lib/mail/api-service.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope**:
- `apps/web/hooks/use-mail-app.ts` (the two loader effects and the state they set — minimal diff, no broader refactor)
- `apps/web/lib/mail/mail-query-keys.ts` (add `config` / `accountStatus` keys)

**Out of scope**:
- `handleSignIn` internals, vault/migration logic — high blast radius, separately planned (014)
- `apps/web/lib/mail/api-service.ts`
- Any change to when sign-in is *allowed* to fire (the gate conditions stay identical)

## Git workflow

- Branch: `advisor/012-parallelize-mail-startup`
- One commit per step.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Convert the config loader to `useQuery`

Replace the config effect + `config` useState with:

```ts
const { data: config = null, error: configError } = useQuery({
  queryKey: mailQueryKeys.config(),   // add to mail-query-keys.ts
  queryFn: () => mailDemoApiService.getConfig(),
  staleTime: 10 * 60 * 1000,
});

useEffect(() => {
  if (configError) {
    log.error("Failed to load mail config", configError);
    toast.error("Could not load the mail configuration.");
  }
}, [configError]);
```

Search the hook for every `setConfig` call (`rg -n 'setConfig' apps/web/hooks/use-mail-app.ts`); if `setConfig` is used outside the deleted effect, keep useState and instead sync it from the query — report in your summary which shape you chose and why.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Convert the account-status loader to `useQuery`

Same treatment:

```ts
const accountStatusEnabled = Boolean(accountEmail && accountUserId);
const {
  data: mailboxStatus = null,
  isLoading: isMailboxStatusLoading,
  error: mailboxStatusError,
} = useQuery({
  queryKey: mailQueryKeys.accountStatus(accountUserId ?? "anon"),
  queryFn: () => mailDemoApiService.getAccountStatus(),
  enabled: accountStatusEnabled,
  staleTime: 60 * 1000,
});
```

Behavioral invariants to preserve (read the old effect carefully):
- When `accountEmail`/`accountUserId` are absent, the old code cleared `mailboxStatus`, `activeMailbox`, and set `isMailboxStatusLoading=false`. With `enabled: false` the query data is `undefined` → `null` via default; but `setActiveMailbox(null)` must still happen — keep a small effect for exactly that:
  `useEffect(() => { if (!accountStatusEnabled) setActiveMailbox(null); }, [accountStatusEnabled]);`
- `isMailboxStatusLoading` must be `false` when disabled: use `isLoading && accountStatusEnabled` (React Query v5 `isLoading` is false for disabled queries — confirm with the installed version's behavior; `@tanstack/react-query ^5.90`).
- Error toast parity with the old `.catch`.
- Other writers: `rg -n 'setMailboxStatus' apps/web/hooks/use-mail-app.ts` — sign-in/provisioning paths may update status manually. Replace those writes with `queryClient.setQueryData(mailQueryKeys.accountStatus(...), ...)` or invalidation of that key, preserving exact semantics.

Both queries now start in parallel on mount (config immediately; status as soon as the session-derived identity exists), removing one serialized hop, and both are cached across remounts.

**Verify**: `cd apps/web && bun run typecheck && cd .. && cd .. && bun run lint` → exit 0

### Step 3: Confirm the sign-in gate is untouched

The auto-sign-in effect (`:1393-1412`) must keep the same condition set, now reading query-backed `config`/`mailboxStatus`/`isMailboxStatusLoading`. Diff-check: `git diff apps/web/hooks/use-mail-app.ts | rg 'hasAttemptedAutoOpenRef|void handleSignIn'` → unchanged lines only.

**Verify**: `cd apps/web && bun run test` → all pass

## Test plan

- Existing mail tests are the safety net: `cd apps/web && bun run test` → all pass. The mail test files (search `rg --files apps/web/__tests__ | rg -i mail`) exercise sign-in flows; any failure there means an invariant above was broken.
- Add one test if a mail-app harness exists: with no account identity, `mailboxStatus` is null, `isMailboxStatusLoading` is false, and `getAccountStatus` is never called.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0
- [ ] `bun run lint` exits 0
- [ ] `rg -n 'getConfig\(\)' apps/web/hooks/use-mail-app.ts` shows it only inside a `useQuery` queryFn
- [ ] `rg -n 'getAccountStatus\(\)' apps/web/hooks/use-mail-app.ts` shows it only inside a `useQuery` queryFn
- [ ] New keys exist in `mail-query-keys.ts`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The two effects no longer match the excerpts (drift — Plan 014 may have landed first; if so this plan needs re-scoping).
- `setMailboxStatus` is written from more than 3 places with semantics you cannot map onto `setQueryData` without changing sign-in behavior.
- Any mail test fails twice after fix attempts — sign-in ordering here is subtle (vault migration paths) and not worth improvising around.

## Maintenance notes

- Plan 014 (god-hook split) builds on this: query-backed config/status are the first extraction targets. Land this first; the index records the ordering.
- Reviewer should scrutinize: behavior when the user signs out while the status query is in flight, and that provisioning flows still see fresh status (check what invalidates `accountStatus`).
- Deferred: kicking off `discoverSession` before the status round-trip completes (bigger sign-in restructure, belongs with 014).
