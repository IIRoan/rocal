# Plan 006: Stop blanket-invalidating all event ranges on every calendar mutation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/hooks/use-calendar-data.ts apps/web/hooks/use-calendar-events-loader.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

The web calendar caches events per month in React Query (active month plus 2 months prefetched in each direction, plus mini-calendar ranges). Every event create/update/delete calls `queryClient.invalidateQueries({ queryKey: ["events"] })`, which refetches **every cached month range**. Each refetch also re-runs E2EE decryption per event in `calendar-api-service.ts`. So a single one-line event edit costs network + decryption proportional to the entire cache, and causes loading flicker on months the user never touched. Scoping invalidation to the ranges an event actually overlaps makes mutations O(affected months) instead of O(cache).

## Current state

- `apps/web/hooks/use-calendar-data.ts` — central calendar data hook (queries + mutations). The mutations to fix:

```ts
// use-calendar-data.ts:136-157 (excerpt)
const createEventMutation = useMutation({
  mutationFn: (event: CreateEventRequest) =>
    calendarApiService.createEvent(event),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
  },
});

const updateEventMutation = useMutation({
  mutationFn: ({ id, event }: { id: string; event: UpdateEventRequest }) =>
    calendarApiService.updateEvent(id, event),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
  },
});

const deleteEventMutation = useMutation({
  mutationFn: (id: string) => calendarApiService.deleteEvent(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["events"] });
  },
});
```

Calendar-level and category-level mutations also invalidate `["events"]` (lines 163-165, 196-197, 225-226) — those are legitimately broad (calendar deletion can remove events in any month) and stay as-is.

- `apps/web/hooks/use-calendar-events-loader.ts` — defines the per-month cache key:

```ts
// use-calendar-events-loader.ts:100-103
function getMonthQueryKey(month: string | null) {
  if (!month) return ["events", "none"] as const;
  return ["events", month] as const;
}
```

The month key is a `YYYY-MM` string (see `monthKey()` in the same file). The loader uses `useQuery({ queryKey: getMonthQueryKey(activeMonth), ... })` (line 164) and `queryClient.prefetchQuery` for adjacent months (lines 192-193, 257-258).

- Repo convention: AGENTS.md mandates targeted `setQueryData` over blanket invalidation for the mail cache; this plan applies the same principle to calendar events. For mutation patterns, see how mail does optimistic updates in `apps/web/hooks/use-mail-app.ts` (search `setQueryData`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` (repo root) | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `apps/web/hooks/use-calendar-data.ts`
- `apps/web/hooks/use-calendar-events-loader.ts` (export the month-key helper)
- `apps/web/__tests__/` (add a test file for the new invalidation helper)

**Out of scope** (do NOT touch):
- Calendar/category mutations' `["calendars"]` / `["categories"]` invalidation, and the `["events"]` invalidation inside `createCalendarMutation`, `deleteCalendarMutation`, `deleteCategoryMutation` — broad invalidation is correct there.
- `clearCache` (line ~250, `queryClient.invalidateQueries()` with no args) — intentional full reset.
- `packages/calendar-client/**` — no API changes.
- Mail caching code.

## Git workflow

- Branch: `advisor/006-targeted-event-cache-invalidation`
- Commit style: short imperative, e.g. `scope event mutation invalidation to affected months` (matches `git log` style like "fix tests").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export month-key helpers from the loader

In `apps/web/hooks/use-calendar-events-loader.ts`, export `getMonthQueryKey` and the existing `monthKey(date)` helper (find it near the top of the file; it produces `YYYY-MM`). Keep their behavior identical.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Add an invalidation helper

In `apps/web/hooks/use-calendar-data.ts`, add a module-level function:

```ts
function invalidateEventRanges(
  queryClient: QueryClient,
  start?: Date | string | null,
  end?: Date | string | null,
) {
  if (!start) {
    queryClient.invalidateQueries({ queryKey: ["events"] });
    return;
  }
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : startDate;
  const months = new Set<string>();
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cursor <= endDate) {
    months.add(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const month of months) {
    queryClient.invalidateQueries({ queryKey: getMonthQueryKey(month) });
  }
}
```

Fallback to broad invalidation when dates are unknown is deliberate — correctness over savings.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Use it in the three event mutations

- `createEventMutation.onSuccess`: change signature to `(data, variables)` and call `invalidateEventRanges(queryClient, variables.start, variables.end)`. Check the actual `CreateEventRequest` field names in `packages/calendar-core` (search `interface CreateEventRequest`) — use whatever the start/end fields are named there.
- `updateEventMutation.onSuccess(data, { id, event })`: an update can move an event between months, so invalidate BOTH the old and new ranges. The old range is not in `variables`; obtain the previous event from the cache: search all `["events", *]` cache entries via `queryClient.getQueriesData({ queryKey: ["events"] })` for the event with matching `id`, and invalidate its months too. If the event is not found in cache, fall back to broad invalidation.
- `deleteEventMutation.onSuccess(data, id)`: same cache-lookup approach to find the deleted event's dates; broad fallback if not found.

**Important recurrence caveat**: recurring events materialize occurrences across many months. If the mutated event (from `variables` or cache lookup) has a recurrence rule (check the event type in `packages/calendar-core` for the recurrence field, e.g. `rrule`/`recurrence`), fall back to broad `["events"]` invalidation — do not try to compute occurrence ranges.

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `cd apps/web && bun run test` → all pass

## Test plan

- New file `apps/web/__tests__/invalidate-event-ranges.test.ts` (export `invalidateEventRanges` from `use-calendar-data.ts` to test it; model the test setup after an existing test in `apps/web/__tests__/`):
  - single-day event → invalidates exactly one month key
  - event spanning 2026-01-30 → 2026-02-02 → invalidates `["events","2026-01"]` and `["events","2026-02"]`
  - missing start → broad `["events"]` invalidation
- Verification: `cd apps/web && bun run test` → all pass including new tests.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, including new tests
- [ ] `rg -n 'invalidateQueries\(\{ queryKey: \["events"\] \}\)' apps/web/hooks/use-calendar-data.ts` matches only inside `createCalendarMutation`, `deleteCalendarMutation`, `deleteCategoryMutation`, and the recurrence/unknown-date fallback paths
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The mutation code at `use-calendar-data.ts:136-157` doesn't match the excerpts (drift).
- `CreateEventRequest` / `UpdateEventRequest` do not carry start/end dates at all (then targeted invalidation needs an API-shape discussion).
- The mini-calendar prefetch ranges use a different key shape than `["events", "YYYY-MM"]` (would silently miss invalidation).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If event query keys ever gain extra segments (e.g. per-calendar), `invalidateEventRanges` must be updated in lockstep.
- Reviewer should scrutinize the recurrence fallback: a recurring event edit that takes the targeted path is a correctness bug (stale occurrences in other months).
- Deferred: full optimistic `setQueryData` updates (no refetch at all). This plan only scopes invalidation; optimistic patching is a follow-up once this is stable.
