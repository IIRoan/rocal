# Plan 001: Fix timezone-aware “today” and default event dates

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bcf873..HEAD -- packages/ui/src/components/navigation/sidebar-calendar.tsx packages/ui/src/components/calendar/event-calendar.tsx packages/ui/src/components/calendar/mobile-event-calendar.tsx packages/ui/src/components/calendar/mobile-calendar-wrapper.tsx packages/ui/src/components/layout/app-sidebar.tsx apps/web/hooks/use-event-form.ts apps/web/components/command-palette/event-utils.ts apps/web/app/calendar/_client.tsx`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7bcf873`, 2026-06-26

## Why this matters

Solace calendar UI must use the user's configured IANA timezone (`AGENTS.md`). Several web surfaces still use the browser's local calendar day via `date-fns` `isToday` or `new Date()` for "today" navigation and new-event defaults. When the user timezone differs from the device (travel, remote work), the sidebar highlights the wrong day, "Today" jumps to the wrong date, and new events open with wrong default dates — while save paths already interpret picker values in the user timezone.

## Current state

**Files and roles:**

- `packages/ui/src/components/navigation/sidebar-calendar.tsx` — mini-calendar in sidebar; uses `isToday(day)` at line 215.
- `packages/ui/src/components/calendar/event-calendar.tsx` — main calendar; `handleToday` calls `navigateTo(new Date())` at lines 453–455.
- `packages/ui/src/components/calendar/mobile-event-calendar.tsx` — mobile calendar shell; same `navigateTo(new Date())` at 368–369.
- `packages/ui/src/components/calendar/mobile-calendar-wrapper.tsx` — mobile wrapper; `setCurrentDate(new Date())` at line 107.
- `packages/ui/src/components/layout/app-sidebar.tsx` — renders `SidebarCalendar` without timezone (lines 178, 411).
- `apps/web/app/calendar/_client.tsx` — renders `AppSidebar` without timezone prop (lines 186–199).
- `apps/web/hooks/use-event-form.ts` — `resetForm` seeds dates with `new Date()` at 417–419.
- `apps/web/components/command-palette/event-utils.ts` — `resetEventForm` same pattern at 28–30.

**Exemplar (correct pattern already in repo):**

```225:225:packages/ui/src/components/calendar/month-view.tsx
// uses isTodayInTimezone(day, resolvedTimezone)
```

**Convention:** Use `resolveTimezone`, `utcToPickerDate`, and `isTodayInTimezone` from `@workspace/calendar-core`. Never use `isToday` from date-fns for user-facing calendar day membership.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 |
| UI package typecheck | `cd packages/ui && bun run typecheck` | exit 0 |
| Web tests | `cd apps/web && bun run test -- __tests__/lib/use-event-form.test.tsx` | all pass |
| Root typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope:**

- `packages/ui/src/components/navigation/sidebar-calendar.tsx`
- `packages/ui/src/components/calendar/event-calendar.tsx`
- `packages/ui/src/components/calendar/mobile-event-calendar.tsx`
- `packages/ui/src/components/calendar/mobile-calendar-wrapper.tsx`
- `packages/ui/src/components/layout/app-sidebar.tsx`
- `apps/web/app/calendar/_client.tsx`
- `apps/web/hooks/use-event-form.ts`
- `apps/web/components/command-palette/event-utils.ts`
- New/updated tests as listed in Test plan

**Out of scope:**

- `packages/ui/src/hooks/use-current-time-indicator.ts` — separate plan (DST/week-boundary risk).
- `apps/web/hooks/use-calendar-data.ts` — covered by plan 002.
- Native app — web/UI only for this plan.

## Git workflow

- Branch: `advisor/001-web-timezone-today-navigation`
- Commit message style: short imperative, e.g. `fix calendar today navigation for user timezone`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add timezone prop to SidebarCalendar

In `sidebar-calendar.tsx`:

1. Add optional `timezone?: string` to `SidebarCalendarProps`.
2. Import `isTodayInTimezone`, `resolveTimezone` from `@workspace/calendar-core`.
3. Replace `const isCurrentDay = isToday(day)` with `isTodayInTimezone(day, resolveTimezone(timezone))`.
4. Remove unused `isToday` import from date-fns if no longer needed.

**Verify**: `cd packages/ui && bun run typecheck` → exit 0

### Step 2: Thread timezone through AppSidebar

In `app-sidebar.tsx`:

1. Add `timezone?: string` to `AppSidebarProps`.
2. Pass `timezone={timezone}` to both `SidebarCalendar` instances (mobile and desktop branches).

In `apps/web/app/calendar/_client.tsx`:

1. Import or access `settings?.timezone` from `useSettings()` in the sidebar render path.
2. Pass `timezone={settings?.timezone}` to `AppSidebar`.

In `mobile-calendar-wrapper.tsx` (if it renders `SidebarCalendar` directly): pass through the existing `timezone` prop already available on the wrapper.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Fix handleToday handlers

In `event-calendar.tsx`, `mobile-event-calendar.tsx`, and `mobile-calendar-wrapper.tsx`:

1. Import `utcToPickerDate`, `resolveTimezone` from `@workspace/calendar-core`.
2. Replace `navigateTo(new Date())` / `setCurrentDate(new Date())` with:
   ```ts
   const today = utcToPickerDate(new Date(), resolveTimezone(timezone));
   navigateTo(today); // or setCurrentDate(today)
   ```
3. Preserve existing `navDirectionRef` logic in `event-calendar.tsx` but compare against `today` instead of `new Date()`.

**Verify**: `cd packages/ui && bun run typecheck` → exit 0

### Step 4: Fix new-event default dates

In `use-event-form.ts` `resetForm`:

1. Use `utcToPickerDate(new Date(), resolveTimezone(localSettings.timezone))` for `startDate`.
2. For `endDate`, clone start and add one hour in wall-clock terms (keep existing `setHours` pattern on the picker date, or set end time to start + 1h via time strings).

In `event-utils.ts` `resetEventForm`:

1. Add a `timezone?: string | null` parameter (or accept it in an options object).
2. Use the same `utcToPickerDate` pattern.
3. Update all callers in command palette to pass `localSettings.timezone` or equivalent.

**Verify**: `cd apps/web && bun run test -- __tests__/lib/use-event-form.test.tsx` → all pass

## Test plan

- Extend `apps/web/__tests__/lib/use-event-form.test.tsx`: add a case where `timezone: "Pacific/Auckland"` and mocked `Date` near UTC midnight produces picker dates in Auckland, not device local.
- Optional: unit test for `resetEventForm` in a new `event-utils.test.ts` if callers are updated.
- Manual: set user timezone to `America/New_York` with device in `Europe/Amsterdam`; confirm sidebar "today" ring and Today button match NY date.

**Verify**: `cd apps/web && bun run test` → all pass

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] No `isToday(` usage remains in `sidebar-calendar.tsx` (`rg 'isToday\(' packages/ui/src/components/navigation/sidebar-calendar.tsx` → no matches)
- [ ] `handleToday` paths use `utcToPickerDate` not bare `new Date()` in the three calendar files
- [ ] `resetForm` / `resetEventForm` use user timezone for default dates
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

- `SidebarCalendar` cannot receive timezone without also changing native consumers — if native breaks typecheck, add optional prop only and fix native call sites with `timezone` from their settings provider.
- `utcToPickerDate` signature differs from excerpt — read `@workspace/calendar-core` source and match actual API.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any new calendar surface that highlights "today" must use `isTodayInTimezone`, not `isToday`.
- If `CalendarContext` later stores timezone centrally, `SidebarCalendar` can read from context instead of a prop — but keep one source of truth.
