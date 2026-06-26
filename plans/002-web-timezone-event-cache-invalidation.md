# Plan 002: Timezone-aware event cache invalidation

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bcf873..HEAD -- apps/web/hooks/use-calendar-data.ts apps/web/components/calendar-data-provider.tsx apps/web/app/calendar/_client.tsx apps/web/__tests__/lib/invalidate-event-ranges.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (under-invalidation is user-visible; over-invalidation is safe)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7bcf873`, 2026-06-26

## Why this matters

After create/update/delete, `invalidateEventRanges` derives month query keys using `Date#getFullYear()` and `getMonth()` on UTC ISO strings. That uses the **browser's** local month, while event fetch keys are built from picker dates in the **user's** timezone. Stale events can remain visible until manual refresh when timezones differ.

## Current state

**`invalidateEventRanges` today** (`apps/web/hooks/use-calendar-data.ts:55-74`):

```ts
const startDate = new Date(start);
const endDate = end ? new Date(end) : startDate;
const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
while (cursor <= endDate) {
  months.add(monthKey(cursor));
  cursor.setMonth(cursor.getMonth() + 1);
}
```

**Callers:** `createEventMutation` (line 195), `updateEventMutation` (217–220), `deleteEventMutation` (244).

**Related bug:** `apps/web/app/calendar/_client.tsx:137` — `calendarData.setMonth(new Date(event.start))` applies local-month extraction to a UTC instant.

**Helper to use** (`packages/calendar-core/src/timezone.ts:347-351`):

```ts
export function formatInstantCalendarMonthKey(
  instant: Date,
  timezone?: string | null,
): string {
  return formatInTimeZone(instant, resolveTimezone(timezone), "yyyy-MM");
}
```

**Tests:** `apps/web/__tests__/lib/invalidate-event-ranges.test.ts` — three cases using local `Date` constructors (will need timezone-aware cases).

**Convention:** Month keys match `getMonthQueryKey` / `monthKey` format `yyyy-MM`. Pass user timezone from `useSettings()` via `CalendarDataProvider`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted tests | `cd apps/web && bun run test -- __tests__/lib/invalidate-event-ranges.test.ts` | all pass |
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 |
| Root typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope:**

- `apps/web/hooks/use-calendar-data.ts`
- `apps/web/components/calendar-data-provider.tsx`
- `apps/web/app/calendar/_client.tsx` (setMonth from event link)
- `apps/web/__tests__/lib/invalidate-event-ranges.test.ts`

**Out of scope:**

- `use-calendar-events-loader.ts` fetch key logic (already timezone-aware if plan 001 landed)
- Recurring-event broad `invalidateQueries({ queryKey: ["events"] })` branches — leave as-is

## Git workflow

- Branch: `advisor/002-web-timezone-event-cache-invalidation`
- Commit style: `fix timezone-aware event month invalidation`

## Steps

### Step 1: Add timezone parameter to invalidateEventRanges

Refactor `invalidateEventRanges`:

```ts
export function invalidateEventRanges(
  queryClient: QueryClient,
  start?: Date | string | null,
  end?: Date | string | null,
  timezone?: string | null,
) {
  if (!start) {
    queryClient.invalidateQueries({ queryKey: ["events"] });
    return;
  }
  const startInstant = new Date(start);
  const endInstant = end ? new Date(end) : startInstant;
  const tz = resolveTimezone(timezone);
  const months = new Set<string>();
  // Walk calendar months between start and end in user timezone
  let cursorKey = formatInstantCalendarMonthKey(startInstant, tz);
  const endKey = formatInstantCalendarMonthKey(endInstant, tz);
  months.add(cursorKey);
  while (cursorKey < endKey) {
    const [y, m] = cursorKey.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    cursorKey = next;
    months.add(cursorKey);
  }
  for (const month of months) {
    queryClient.invalidateQueries({ queryKey: getMonthQueryKey(month) });
  }
}
```

Import `formatInstantCalendarMonthKey`, `resolveTimezone` from `@workspace/calendar-core`.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Thread timezone into useCalendarData mutations

1. Add `timezone?: string | null` to `UseCalendarDataOptions`.
2. Pass `timezone` from `CalendarDataProvider` using `useSettings().settings?.timezone`.
3. Update all `invalidateEventRanges(queryClient, ...)` calls in mutation `onSuccess` to pass `timezone`.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Fix email deep-link setMonth

In `apps/web/app/calendar/_client.tsx` line 137:

Replace `calendarData.setMonth(new Date(event.start))` with:

```ts
calendarData.setMonth(
  utcToPickerDate(new Date(event.start), resolveTimezone(settings?.timezone)),
);
```

Ensure `settings` is in scope in that effect; import helpers from `@workspace/calendar-core`.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 4: Update tests

Extend `invalidate-event-ranges.test.ts`:

1. Keep existing tests (they still validate structure).
2. Add case: UTC instant `2026-03-01T02:00:00.000Z` with timezone `America/Los_Angeles` should invalidate `2026-02` (still Feb 28 evening in LA).
3. Add cross-month case with explicit timezone.

**Verify**: `cd apps/web && bun run test -- __tests__/lib/invalidate-event-ranges.test.ts` → all pass

## Test plan

- Primary: updated `invalidate-event-ranges.test.ts` with timezone matrix.
- Regression: run full web test suite if time permits.

## Done criteria

- [ ] `invalidateEventRanges` accepts `timezone` and uses `formatInstantCalendarMonthKey`
- [ ] Mutations pass user timezone from settings
- [ ] `_client.tsx` deep-link uses `utcToPickerDate` for `setMonth`
- [ ] `bun run typecheck` exits 0
- [ ] `invalidate-event-ranges.test.ts` includes at least one non-UTC timezone case
- [ ] `plans/README.md` row 002 → DONE

## STOP conditions

- `formatInstantCalendarMonthKey` output format differs from `monthKey()` output — read both and align before changing tests.
- `CalendarDataProvider` cannot call `useSettings` (provider order issue) — pass timezone from a child wrapper `CalendarDataProviderInner` instead; report approach.
- Month-walk loop infinite — add assertion `months.size < 24` guard and STOP.

## Maintenance notes

- Any new mutation that invalidates event months must pass user timezone.
- If events move to instant-based keys entirely, this helper can be simplified — until then, month keys must match the loader.
