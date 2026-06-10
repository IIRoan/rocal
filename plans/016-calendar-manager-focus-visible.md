# Plan 016: Restore visible keyboard focus in calendar-manager rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/components/calendar-manager.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (accessibility)
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

Six interactive rows in the calendar manager use `focus:outline-none` with only `focus:bg-accent/50` as the focus indicator. `bg-accent/50` is a very subtle tint on this palette and is also nearly identical to the `hover:bg-accent/30` state — a keyboard user tabbing through the calendar list gets close to zero visible indication of where focus is. The repo's own shared components solve this correctly: `packages/ui/src/components/ui/button.tsx` uses `outline-none` paired with `focus-visible:ring-*` classes. These rows should match that pattern.

## Current state

- `apps/web/components/calendar-manager.tsx` — six occurrences, all the same shape:

```
238:  className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
248:  (identical)
281:  className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0 rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
345:  (identical to 281)
411:  (identical to 281)
707:  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none disabled:opacity-60"
```

- The repo's exemplar focus treatment — `packages/ui/src/components/ui/button.tsx` (read its base class string): `outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` (confirm exact classes by reading the file; match them).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |

## Scope

**In scope**:
- `apps/web/components/calendar-manager.tsx` (the six className strings only)

**Out of scope**:
- `packages/ui` components (their `outline-none` is correctly paired with `focus-visible:` rings already)
- Any structural/markup change to calendar-manager
- Other files with `outline-none` (audited: shared ui components handle it correctly)

## Git workflow

- Branch: `advisor/016-calendar-manager-focus-visible`
- Single commit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Apply the shared focus pattern

In each of the six classNames, replace `focus:bg-accent/50 focus:outline-none` with:

```
focus-visible:bg-accent/50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50
```

(Use the exact ring classes from `button.tsx` if they differ from the above — the goal is pixel-consistency with the rest of the app. Keep every other class untouched. `focus:` → `focus-visible:` for the bg tint is intentional: mouse clicks shouldn't flash the focus treatment.)

**Verify**: `rg -n 'focus:outline-none' apps/web/components/calendar-manager.tsx` → no matches; `rg -c 'focus-visible:ring' apps/web/components/calendar-manager.tsx` → 6.

### Step 2: Checks

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `bun run lint` → exit 0; `cd apps/web && bun run test` → all pass.

## Test plan

- Existing web tests must pass; className-only change, no new tests.
- Reviewer manual check: open the calendar manager dialog, press Tab — each row shows a visible ring; mouse clicks show no ring.

## Done criteria

- [ ] `rg -n 'focus:outline-none' apps/web/components/calendar-manager.tsx` returns nothing
- [ ] All six rows carry `focus-visible:ring` classes
- [ ] `cd apps/web && bun run typecheck` exits 0, `bun run lint` exits 0, `cd apps/web && bun run test` exits 0
- [ ] Only `calendar-manager.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The six lines no longer match the excerpts (drift).
- `button.tsx`'s focus classes use a token (`ring-ring`) that doesn't resolve in `apps/web` (would indicate a theme-mapping gap — report).

## Maintenance notes

- Any new interactive row in app code should copy the button.tsx focus-visible pattern; reviewers should reject bare `focus:outline-none`.
- Deferred: a lint rule (eslint-plugin-tailwindcss or a custom rule) banning `outline-none` without an accompanying `focus-visible:` class — worth considering if this recurs.
