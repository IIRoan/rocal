# Plan 007: Mount only one calendar tree per viewport and stabilize the calendar data context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/app/calendar/_client.tsx apps/web/hooks/use-calendar-data.ts apps/web/components/calendar-data-provider.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (lands cleanly before or after 006)
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

Two compounding problems on `/calendar`:

1. The page renders BOTH the mobile calendar tree and the desktop calendar tree at all times, hiding one with CSS (`lg:hidden` / `hidden lg:flex`). Both trees mount, subscribe to the same providers, transform the same events, and run effects — the hidden one is pure wasted CPU on every device, and both dynamic chunks download.
2. `useCalendarData` returns a fresh object literal (with inline lambdas) on every render, used directly as a context value. Every query/mutation state transition gives all `useSharedCalendarData` consumers a new identity, defeating memoization downstream — and that re-render cost is currently doubled by problem 1.

Fixing both roughly halves render work on `/calendar` and makes future memoization effective.

## Current state

- `apps/web/app/calendar/_client.tsx` — calendar page client shell. The dual mount:

```tsx
// _client.tsx:296-305
export function CalendarPageContent() {
  return (
    <>
      <div className="lg:hidden min-h-[100dvh] safe-area-inset-bottom">
        <MobileLayoutContent />
      </div>

      <CalendarWithData className="hidden h-full min-h-screen lg:flex lg:flex-1" />
    </>
  );
}
```

`MobileCalendarWrapper` and `CalendarWithData` are already `next/dynamic` with `ssr: false` and loading skeletons (see `_client.tsx:44-61`), so code-splitting is in place — only the *mounting* is unconditional.

- `packages/ui/src/hooks/use-mobile.ts` — existing hook, breakpoint 1024 (= Tailwind `lg`), returns `undefined`-coerced-to-`false` before first effect:

```ts
const MOBILE_BREAKPOINT = 1024;
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);
  // matchMedia listener; returns !!isMobile
}
```

Note: `useIsMobile` returns `false` during the first client render (state still `undefined`). With `output: "export"` and `ssr: false` dynamic imports there is no hydration-mismatch risk, but a mobile user would briefly mount the desktop tree. The step below handles this.

- `apps/web/hooks/use-calendar-data.ts:297-360` — returns an object literal directly:

```ts
return {
  events,
  calendars: calendarsQuery.data || [],
  ...
  createEvent: (event) => createEventMutation.mutateAsync(event),
  updateEvent: (id, event) => updateEventMutation.mutateAsync({ id, event }),
  ...
};
```

- `apps/web/components/calendar-data-provider.tsx:28-38` — passes that object straight into `CalendarDataContext.Provider value={calendarData}`.

- Convention: hooks in this repo already use `useCallback` extensively (see `refetchCalendars` etc. in the same file); match that.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |

## Scope

**In scope**:
- `apps/web/app/calendar/_client.tsx`
- `apps/web/hooks/use-calendar-data.ts`
- `apps/web/components/calendar-data-provider.tsx` (only if types need adjusting)

**Out of scope**:
- `packages/ui/src/components/calendar/**` (the calendar views themselves — Plan 008 covers month view)
- The mail surfaces, command palette, settings
- `useIsMobile` itself — do not change its breakpoint or behavior; other consumers rely on it

## Git workflow

- Branch: `advisor/007-single-calendar-tree-and-context-memo`
- Commit per step; short imperative messages.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Memoize the `useCalendarData` return value

In `apps/web/hooks/use-calendar-data.ts`:

1. Wrap each inline CRUD lambda in `useCallback` (deps: the corresponding mutation object, e.g. `[createEventMutation]` — mutation objects from `useMutation` are referentially stable enough via `mutateAsync`; alternatively depend on `createEventMutation.mutateAsync`).
2. Wrap the returned object in `useMemo` whose deps are every value referenced inside it (events, query data/flags/errors, and the now-stable callbacks). Let the exhaustive-deps lint rule drive the list: run `bun run lint` and add exactly what it demands.

**Verify**: `cd apps/web && bun run typecheck && cd ../.. && bun run lint` → exit 0

### Step 2: Mount only one calendar tree

In `apps/web/app/calendar/_client.tsx`, change `CalendarPageContent` to:

```tsx
import { useIsMobile } from "@workspace/ui/hooks";

export function CalendarPageContent() {
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <DashboardSkeleton />; // already imported in this file
  }

  return isMobile ? (
    <div className="min-h-[100dvh] safe-area-inset-bottom">
      <MobileLayoutContent />
    </div>
  ) : (
    <CalendarWithData className="h-full min-h-screen flex flex-1" />
  );
}
```

Notes:
- The `mounted` gate avoids mounting the desktop tree on mobile during the first render (when `useIsMobile` still returns `false`). One skeleton frame replaces the previous CSS-hidden double mount.
- Remove the now-dead `lg:hidden` wrapper and the `hidden lg:flex` classes; keep the rest of the className intact (`h-full min-h-screen flex flex-1`).
- Check whether `useIsMobile` is exported from `@workspace/ui/hooks` (it is re-exported via `packages/ui/src/hooks/index.ts`); import from there.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Confirm breakpoint behavior matches

The CSS breakpoint was `lg` (1024px); `MOBILE_BREAKPOINT` is 1024. Confirm with: `rg -n 'MOBILE_BREAKPOINT' packages/ui/src/hooks/use-mobile.ts` → `1024`. Resizing across 1024px must swap trees (the `matchMedia` listener handles this).

**Verify**: `cd apps/web && bun run test` → all pass; `bun run lint` → exit 0

## Test plan

- Existing web tests must keep passing (`cd apps/web && bun run test`).
- No new unit tests required: the change is structural mounting logic with no extractable pure function. If `apps/web/__tests__/` contains a render test for the calendar page, update it for the new conditional structure.
- Manual note for the reviewer (do not run dev servers yourself): at <1024px only the mobile tree should be in the DOM; at ≥1024px only the desktop tree.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `cd apps/web && bun run test` exits 0
- [ ] `rg -n 'lg:hidden' apps/web/app/calendar/_client.tsx` returns no match in `CalendarPageContent`
- [ ] `rg -n 'return \{' apps/web/hooks/use-calendar-data.ts` — the hook's return is inside a `useMemo`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `CalendarPageContent` no longer matches the excerpt (drift).
- `DashboardSkeleton` is not available in `_client.tsx`'s imports and no equivalent loading component exists in `@workspace/ui/components/ui`.
- Memoizing the return value breaks a test that relies on fresh function identities (would indicate a consumer depends on identity-change to re-run effects — report which one).
- `useIsMobile`'s breakpoint is not 1024 (CSS/JS breakpoints would diverge).

## Maintenance notes

- Any new consumer of `useSharedCalendarData` can now rely on referential stability; adding new fields to the hook's return requires adding them to the `useMemo` deps (lint enforces this).
- Reviewer should scrutinize: behavior exactly at 1024px, and that the one-frame skeleton on first paint doesn't regress perceived load (the page previously showed the dynamic-import skeletons anyway).
- Deferred: the same dual-mount pattern may exist on `/mail` — check `apps/web/components/mail/mail-app.tsx` in a follow-up.
