# Plan 010: Reduce mail message-list render cost (hoist per-row Set, memoize rows, windowing)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/components/mail/message-list.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (windowing part) / LOW (steps 1-2)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

The mail list renders every loaded thread row in a plain `.map` with no virtualization, and infinite scroll keeps appending pages (20 per page). Three costs compound:

1. `const primaryIds = new Set(messages.map((m) => m.id))` is rebuilt **inside the row map** — O(rows × messages) per render.
2. Rows are heavyweight (ContextMenu wrapper, avatar, label chips) and not memoized, so any selection/star/read-state change re-renders all of them.
3. After paging through a few hundred messages the DOM holds hundreds of these rows.

Steps 1-2 are cheap, safe wins. Step 3 (windowing) uses CSS `content-visibility` rather than a JS virtualizer to avoid disturbing the IntersectionObserver load-more sentinel and context menus.

## Current state

- `apps/web/components/mail/message-list.tsx` (645 lines) — the list component. The row loop:

```tsx
// message-list.tsx:300-312
<div className="flex flex-col divide-y divide-border/40">
  {threadRows.map((row) => {
      const message = row.latestMessage;
      const isSelected = row.messageIds.includes(selectedMessageId ?? "");
      const selectedCount = row.messageIds.filter((id) =>
        selectedIds.has(id),
      ).length;
      const isChecked = selectedCount === row.messageIds.length;
      // Only count unread from primary mailbox messages (not sent/related extras)
      const primaryIds = new Set(messages.map((m) => m.id));   // <-- rebuilt per row
      const primaryMessages = row.messages.filter((entry) =>
        primaryIds.has(entry.id),
      );
```

Each row body continues through `message-list.tsx:~332-560`: `<ContextMenu key={row.id}><ContextMenuTrigger asChild><div role="button" ...>` with avatar, sender, snippet, label chips, then `<ContextMenuContent>` with mark read/unread, star, etc.

- Other top-level Sets in the same file (fine, they are outside the map): line 73 `new Set(messages.map((message) => formatAddress(message.from)))`, line 179 `seenIds`, line 212 select-all handler.
- Load-more: an IntersectionObserver sentinel lives in this file or its parent (`rg -n 'IntersectionObserver|loadMore' apps/web/components/mail/message-list.tsx apps/web/components/mail/mail-app.tsx`) — find it before Step 3 and do not break it.
- Repo conventions: components in this dir are function components with inline handlers; memoization where present uses `useMemo`/`React.memo` (search `React.memo` in `apps/web/components/mail/` for prior art).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |

## Scope

**In scope**:
- `apps/web/components/mail/message-list.tsx`

**Out of scope**:
- `apps/web/hooks/use-mail-app.ts` (its god-hook problem is Plan 014 — do not start splitting it here)
- A JS virtualizer dependency (e.g. @tanstack/react-virtual) — do NOT add new deps; use CSS containment
- Mail query/cache logic, context menu actions' behavior

## Git workflow

- Branch: `advisor/010-mail-list-render-cost`
- One commit per step.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Hoist the per-row Set

Above the `threadRows.map`, add:

```tsx
const primaryIds = useMemo(
  () => new Set(messages.map((m) => m.id)),
  [messages],
);
```

and delete the line inside the map. Keep the variable name so row code is untouched.

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `rg -n 'new Set\(messages' apps/web/components/mail/message-list.tsx` shows no match inside the `threadRows.map` body.

### Step 2: Extract and memoize the row

Extract the entire `threadRows.map` body into a `MessageListRow` component in the same file, wrapped in `React.memo`. Props: `row`, the derived primitives the row needs (`isSelected`, `isChecked`, `selectedCount`), `primaryIds`, `labels`, and the handler props it calls (`onSelect`, `onMarkAsUnread`, `onBulkMarkAsUnread`, `onToggleStar`, etc. — enumerate by reading the row body; pass exactly what it uses).

For `React.memo` to pay off, handlers passed in must be referentially stable. Check how the parent receives them (props from `mail-app.tsx`); wrap any inline arrow handlers created in `MessageList` itself in `useCallback`. Do NOT add a custom `arePropsEqual` — default shallow comparison with stable props is enough; `selectedIds` (a Set) changes identity when selection changes, so pass derived primitives (`isChecked`, `selectedCount`, `isSelected`) instead of the Set itself.

**Verify**: `cd apps/web && bun run typecheck && cd ../.. && bun run lint` → exit 0; `cd apps/web && bun run test` → all pass.

### Step 3: CSS windowing via content-visibility

On the row's outermost element inside `MessageListRow`, add to the existing className: `[content-visibility:auto] [contain-intrinsic-size:auto_72px]`.

Determine the placeholder height by reading the row's actual padding/line structure (estimate from py classes + content lines; an approximate value is fine — `contain-intrinsic-size` only needs to be close to keep scrollbar stable). This keeps all rows in the DOM (context menus, a11y, and the load-more sentinel unaffected) while the browser skips layout/paint for offscreen rows.

**Verify**: `cd apps/web && bun run test` → all pass; `rg -n 'content-visibility' apps/web/components/mail/message-list.tsx` → 1 match.

## Test plan

- Existing mail tests must pass unchanged: `cd apps/web && bun run test`.
- If `apps/web/__tests__/` has a message-list test, extend it with: row renders sender/subject; clicking a row calls `onSelect` with the latest message id; unread count only counts ids present in `messages` (the `primaryIds` behavior — this is the regression-sensitive logic from the inline Set).
- If no message-list test exists, add `apps/web/__tests__/message-list.test.tsx` covering those three cases, modeled structurally on an existing component test in that directory.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `cd apps/web && bun run test` exits 0 (including any new tests)
- [ ] `MessageListRow` exists and is wrapped in `React.memo`
- [ ] No `new Set(` calls inside the row map body
- [ ] No new dependencies in `apps/web/package.json` (`git diff apps/web/package.json` empty)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The row loop no longer matches the excerpt (drift).
- The row body turns out to read mutable values from closure that cannot be passed as props without behavior change (report which).
- `content-visibility` breaks the load-more sentinel (sentinel never intersects) — remove Step 3's classes and report; Steps 1-2 still stand.
- Handlers from the parent (`mail-app.tsx` props) are recreated every render and stabilizing them requires editing `use-mail-app.ts` — that file is out of scope (Plan 014); note it and ship Steps 1-3 with partial memo benefit.

## Maintenance notes

- New per-row derivations belong in `MessageListRow` or a `useMemo` above the map — reviewers should reject new closure-captured collections inside the map.
- If a real virtualizer is ever adopted, remove the `content-visibility` classes at the same time.
- Interaction with Plan 014: once mail state moves to React Query, row props become naturally stable; revisit whether the derived-primitive prop plumbing can be simplified.
