# Plan 005: Stop blocking GET /events on Stalwart sync

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 92d2488..HEAD -- apps/backend/services/event.service.ts apps/backend/__tests__/services/event.service.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `92d2488`, 2026-06-10

## Why this matters

Every `GET /events` for users with a Stalwart-linked calendar awaits `syncStalwartEvents()` before reading PostgreSQL. That path queries up to 500 remote event IDs, fetches full records, and upserts each with participant sync — so calendar view latency tracks external mail server RTT, not DB speed.

## Current state

- `apps/backend/services/event.service.ts` — `list()` at ~714-722 awaits sync; `syncStalwartEvents` at ~177-198.
- `apps/backend/routes/events.ts:190-206` — `GET /events` calls `eventService.list()`.
- Mail realtime / ingestion may also trigger sync elsewhere — keep those paths; this plan only decouples the list hot path.

Blocking call:

```714:722:apps/backend/services/event.service.ts
    const stalwartAccountId = await this.getStalwartAccountId(userId);
    if (stalwartAccountId) {
      await this.syncStalwartEvents({
        userId,
        accountId: stalwartAccountId,
        startDate,
        endDate,
      });
    }
```

**Convention**: Use `createLogger` for background errors (see `event.service.ts` imports). In-memory dedupe maps exist elsewhere in mail sync — a simple `Map<string, Promise<void>>` per `userId` is acceptable for this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd apps/backend && bun run typecheck` | exit 0 |
| Event service tests | `cd apps/backend && bun run test -- __tests__/services/event.service.test.ts` | all pass |
| Full backend | `cd /var/home/roan/Documents/rocal && bun run test:backend` | exit 0 |

## Scope

**In scope**:
- `apps/backend/services/event.service.ts` (sync scheduling + `list()` only)
- `apps/backend/__tests__/services/event.service.test.ts` (add regression test)

**Out of scope**:
- Batching upserts inside `upsertStalwartEventsFromRemote` (follow-up perf)
- Bounding recurring-series queries (PERF-02)
- Pagination on list responses (PERF-03)
- New background job infrastructure / Redis queues

## Git workflow

- Branch: `advisor/005-decouple-stalwart-sync-from-list`
- Commit message: `perf: run stalwart event sync in background on list`

## Steps

### Step 1: Add per-user sync dedupe helper on EventService

At class level (private fields):

```typescript
private stalwartListSyncInFlight = new Map<string, Promise<void>>();
```

Add private method:

```typescript
private scheduleStalwartEventsSync(input: {
  userId: string;
  accountId: string;
  startDate: Date;
  endDate: Date;
}): void {
  const key = input.userId;
  if (this.stalwartListSyncInFlight.has(key)) {
    return;
  }

  const syncPromise = this.syncStalwartEvents(input)
    .catch((error) => {
      logger.error("Background Stalwart event sync failed", {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      this.stalwartListSyncInFlight.delete(key);
    });

  this.stalwartListSyncInFlight.set(key, syncPromise);
}
```

Use the existing module `logger` if present on `EventService`; otherwise `createLogger("backend:event-service")`.

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 2: Replace blocking await in `list()`

Change:

```typescript
await this.syncStalwartEvents({ ... });
```

to:

```typescript
this.scheduleStalwartEventsSync({
  userId,
  accountId: stalwartAccountId,
  startDate,
  endDate,
});
```

`list()` must proceed immediately to `Promise.all([findMany...])` without awaiting sync.

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 3: Add test proving list does not await sync

In `event.service.test.ts`, find or add a `list()` test with Stalwart client mocked:

1. Make `syncStalwartEvents` (or stalwart client methods) return a Promise that does not resolve until a deferred resolves.
2. Call `list()` and assert it completes **before** the deferred is resolved.
3. Assert DB `findMany` was called without waiting for sync completion.

If `syncStalwartEvents` is private, spy on `stalwartClient.queryEventIds` delay instead.

**Verify**: `cd apps/backend && bun run test -- __tests__/services/event.service.test.ts` → pass including new test

### Step 4: Full suite

**Verify**: `cd /var/home/roan/Documents/rocal && bun run test:backend` → exit 0

## Test plan

- One new test: `list returns before stalwart sync completes`.
- Pattern: deferred promise + `jest.useFakeTimers` only if needed; prefer explicit deferred over timers.

## Done criteria

- [ ] `list()` does not `await syncStalwartEvents`
- [ ] Background sync deduped per `userId`
- [ ] Sync errors logged, not thrown to client
- [ ] Regression test added
- [ ] `bun run typecheck` and `bun run test:backend` exit 0
- [ ] `plans/README.md` updated

## STOP conditions

- `list()` is the only sync entry point and removing await causes multi-minute staleness unacceptable to product — report; propose explicit `POST /events/sync` instead.
- Tests cannot mock Stalwart client on `EventService` construction — document constructor injection gap and STOP.
- Background sync causes test flakiness — ensure test awaits `finally` cleanup or mocks `scheduleStalwartEventsSync`.

## Maintenance notes

- Users may see events up to one sync interval stale on calendar open; mail-realtime / manual refresh paths should still trigger sync.
- Follow-up: batch upserts in `upsertStalwartEventsFromRemote` and bound recurring query (PERF-02/03).
- Reviewers: confirm no duplicate thundering herd when user rapidly pans calendar (dedupe map should collapse concurrent schedules).
