# Plan 008: Memoize month-view per-day event buckets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- packages/ui/src/components/calendar/month-view.tsx packages/ui/src/components/calendar/utils.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

The month view calls three full-list filter helpers **inline per day cell, per render**: `getEventsForDay`, `getSpanningEventsForDay`, `getAllEventsForDay`, plus `sortEvents(allDayEvents)` inside JSX. A month grid has ~42 cells, so each render does ~126 full scans of the events array, and each helper allocates `new Date(...)` per event per call. This re-runs on every hover, drag, or popover state change. The week view already memoizes its per-day buckets correctly — month view should match that pattern. With several hundred events loaded (the loader prefetches ±2 months), this is the hottest render path in the calendar.

## Current state

- `packages/ui/src/components/calendar/month-view.tsx` — the hot loop:

```tsx
// month-view.tsx:154-162 (inside weeks.map -> week.map)
{week.map((day, dayIndex) => {
  if (!day) return null;

  const dayEvents = getEventsForDay(events, day);
  const spanningEvents = getSpanningEventsForDay(events, day);
  const isCurrentMonth = isSameMonth(day, currentDate);
  const cellId = `month-cell-${day.toISOString()}`;
  const allDayEvents = [...spanningEvents, ...dayEvents];
  const allEvents = getAllEventsForDay(events, day);
```

and further down, per cell, inside JSX:

```tsx
// month-view.tsx:~211
{sortEvents(allDayEvents).map((event, index) => {
```

- `packages/ui/src/components/calendar/utils.ts:92-150` — the helpers; each filters the whole `events` array and allocates Dates per event (`getEventsForDay` at 92, `sortEvents` at 107, `getSpanningEventsForDay` at 122, `getAllEventsForDay` at 139).

- The exemplar to match — `packages/ui/src/components/calendar/week-view.tsx:105-156` memoizes per-day buckets:

```tsx
const allDayEventsByDay = useMemo(
  () =>
    days.map((day) =>
      sortEvents(
        allDayEvents.filter((event) =>
          eventOverlapsRange(event, day, day, "day"),
        ),
      ),
    ),
  [allDayEvents, days],
);
```

- `month-view.tsx` already imports `useMemo` (line 3) and computes `weeks` (the `Date[][]` grid) — find the existing `useMemo` for `weeks`/`days` near the top of the component body.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| UI package tests | `bun run test:ui` (repo root) | all pass |
| Typecheck (web consumes the package) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope**:
- `packages/ui/src/components/calendar/month-view.tsx`
- `packages/ui/src/components/calendar/utils.ts` (only if adding a new bucketing helper there)
- A new test file under `packages/ui` (match where existing calendar tests live: `rg --files packages/ui | rg test`)

**Out of scope**:
- `week-view.tsx`, `day-view.tsx`, `agenda-view.tsx`, `timeline-layout.ts` — already memoized or covered by a rejected finding
- Mobile calendar components
- Visual/markup changes of any kind — this is a pure derivation refactor; rendered output must be identical

## Git workflow

- Branch: `advisor/008-month-view-event-bucketing`
- Short imperative commit messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build memoized per-day buckets

In `month-view.tsx`, above the JSX, add one `useMemo` that computes everything the cells need in a single pass over `events`:

```tsx
type DayBuckets = {
  dayEvents: CalendarEvent[];      // result of getEventsForDay(events, day)
  spanningEvents: CalendarEvent[]; // result of getSpanningEventsForDay(events, day)
  allEvents: CalendarEvent[];      // result of getAllEventsForDay(events, day)
  sortedAllDay: CalendarEvent[];   // sortEvents([...spanningEvents, ...dayEvents])
};

const bucketsByDay = useMemo(() => {
  const map = new Map<string, DayBuckets>();
  for (const week of weeks) {
    for (const day of week) {
      if (!day) continue;
      const dayEvents = getEventsForDay(events, day);
      const spanningEvents = getSpanningEventsForDay(events, day);
      map.set(day.toISOString(), {
        dayEvents,
        spanningEvents,
        allEvents: getAllEventsForDay(events, day),
        sortedAllDay: sortEvents([...spanningEvents, ...dayEvents]),
      });
    }
  }
  return map;
}, [events, weeks]);
```

This is the minimal, behavior-identical version: same helpers, computed once per `events`/`weeks` change instead of per render. (A single-pass O(N) bucketing rewrite is allowed but NOT required; only do it if the helpers' semantics are preserved exactly — `getEventsForDay` sorts by start, `getSpanningEventsForDay` excludes the start day, `getAllEventsForDay` uses `eventOverlapsRange`.)

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Use the buckets in the cell loop

Replace the per-cell calls:

```tsx
const buckets = bucketsByDay.get(day.toISOString());
if (!buckets) return null;
const { dayEvents, spanningEvents, allEvents, sortedAllDay } = buckets;
const allDayEvents = [...spanningEvents, ...dayEvents]; // keep if referenced for .length
```

and replace `sortEvents(allDayEvents).map(...)` in the JSX with `sortedAllDay.map(...)`. Search the rest of the component for other uses of `dayEvents` / `allEvents` (the "+N more" popover uses `allEvents`) and wire them to the bucket values.

**Verify**: `cd apps/web && bun run typecheck && cd ../.. && bun run lint` → exit 0

### Step 3: Run the UI test suite

**Verify**: `bun run test:ui` → all pass

## Test plan

- Add a test (in the same location/pattern as existing `packages/ui` tests — check `packages/ui/jest.config*` and existing `*.test.ts(x)` files) covering the bucketing logic if you extracted it as a pure helper; cases:
  - single-day event appears in `dayEvents` for its day only
  - 3-day event appears in `spanningEvents` for days 2-3 but not day 1
  - `sortedAllDay` puts multi-day events before timed events (mirrors `sortEvents`)
- If you did NOT extract a helper (inline `useMemo` only), rely on the existing calendar tests: `bun run test:ui` must pass unchanged — they assert rendered month-view behavior.

## Done criteria

- [ ] `bun run test:ui` exits 0
- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `rg -n 'getEventsForDay\(events' packages/ui/src/components/calendar/month-view.tsx` matches only inside the `useMemo` (not in the cell loop)
- [ ] `rg -n 'sortEvents\(' packages/ui/src/components/calendar/month-view.tsx` matches only inside the `useMemo`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The cell loop no longer matches the "Current state" excerpt (drift).
- `weeks` is not produced by a `useMemo` (a fresh array each render would defeat the bucket memo — report rather than restructuring the date grid).
- Any existing UI test fails differently before vs. after your change in a way you cannot attribute to the bucketing (possible behavior change — the output must be identical).

## Maintenance notes

- Anyone adding a new per-day derivation to month view should add it to the `bucketsByDay` memo, not inline in the cell loop — reviewers should reject new inline `events.filter` in this file.
- If drag-and-drop later mutates events optimistically mid-drag, confirm `events` identity changes so the memo recomputes.
- Deferred: true O(N) single-pass bucketing across the visible range, and the O(n²) overlap counting in `timeline-layout.ts:225` (audited, judged not user-visible at current event densities).
