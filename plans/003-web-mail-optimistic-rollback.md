# Plan 003: Roll back mail keyword optimistic updates on failure

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bcf873..HEAD -- apps/web/hooks/use-mail-app.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7bcf873`, 2026-06-26

## Why this matters

Mail star/read/label toggles optimistically update `activeMailbox.messages` then call JMAP. On failure, handlers only log — UI shows succeeded state while server disagrees. `AGENTS.md` documents targeted optimistic cache updates with rollback on failure; these keyword handlers are missing rollback.

## Current state

**Example — `handleToggleFlagged`** (`apps/web/hooks/use-mail-app.ts:3504-3526`):

```ts
setActiveMailbox((cur) => /* optimistic keywords patch */);
try {
  await activeMailbox.client.toggleFlagged(activeMailbox.session, targetId, next);
} catch (error) {
  log.error("Failed to toggle flag", error);
}
```

**Same pattern (no rollback):**

- `handleMarkAsRead` ~3322-3337
- `handleMarkAsUnread` ~3287-3307
- `handleBulkMarkAsRead` ~3237-3256
- `handleBulkMarkAsUnread` ~3208-3228
- `handleSetMessageLabel` ~3535-3558
- Auto-read effect ~1492-1518 (keeps `$seen` on failure)

**Rollback helper:** `mergeMessageIntoMailboxCaches(queryClient, message)` in `apps/web/lib/mail/mail-message-query.ts:76`.

**Error UX pattern:** `handleQuickReply` catch uses `toast.error(getErrorMessage(error, "..."))` at lines 2638-2654.

**Imports already present in use-mail-app:** `mergeMessageIntoMailboxCaches`, `getErrorMessage`, `toast`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 |
| Mail app tests | `cd apps/web && bun run test -- __tests__/components/mail-app.test.tsx` | all pass |
| Message query tests | `cd apps/web && bun run test -- __tests__/lib/mail-message-query.test.ts` | all pass |

## Scope

**In scope:**

- `apps/web/hooks/use-mail-app.ts` — keyword toggle handlers listed above
- New test file `apps/web/__tests__/hooks/use-mail-keyword-rollback.test.ts` (or extend mail-app tests)

**Out of scope:**

- Refactoring/splitting `use-mail-app.ts`
- Delete/move invalidation patterns
- Native mail hooks

## Git workflow

- Branch: `advisor/003-web-mail-optimistic-rollback`
- Commit style: `fix mail keyword optimistic rollback on JMAP failure`

## Steps

### Step 1: Extract a small rollback helper (inline or local function)

Inside `use-mail-app.ts` (file-local, not exported unless needed for tests):

```ts
function patchMessageKeywords(
  mailbox: ActiveMailbox,
  messageId: string,
  keywords: Record<string, boolean> | undefined,
): ActiveMailbox {
  return {
    ...mailbox,
    messages: mailbox.messages.map((m) =>
      m.id === messageId ? { ...m, keywords } : m,
    ),
  };
}
```

For bulk handlers, snapshot `messages` keyword state for affected IDs before optimistic update.

### Step 2: Fix single-message handlers

For `handleToggleFlagged`, `handleMarkAsRead`, `handleMarkAsUnread`, `handleSetMessageLabel`:

1. Before optimistic update, capture `const previousKeywords = { ...(msg.keywords ?? {}) }`.
2. Apply optimistic patch (existing code).
3. In `catch`:
   - `setActiveMailbox((cur) => cur ? patchMessageKeywords(cur, targetId, previousKeywords) : cur)`
   - `mergeMessageIntoMailboxCaches(queryClient, { ...msg, keywords: previousKeywords })`
   - `toast.error(getErrorMessage(error, "<action-specific message>"))`

Add `queryClient` to dependency arrays where missing.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Fix bulk handlers

For `handleBulkMarkAsRead` / `handleBulkMarkAsUnread`:

1. Snapshot prior keywords per message ID in the selection set.
2. On catch, restore each message and call `mergeMessageIntoMailboxCaches` per restored message (or batch if a batch helper exists).
3. Single `toast.error` for the bulk action.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 4: Fix auto-read on open failure

In the auto-read effect (~1492-1518): on `markAsRead` failure, revert `$seen` keyword and merge cache rollback like step 2.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

## Test plan

Create `apps/web/__tests__/hooks/use-mail-keyword-rollback.test.ts`:

- Extract rollback logic into a **pure function** if hook testing is too heavy — e.g. `revertMessageKeywords(mailbox, messageId, previousKeywords)` — and unit test that.
- Alternatively: test via mocked `toggleFlagged` rejection in a focused hook test with `@testing-library/react` `renderHook` — follow pattern in `apps/web/__tests__/lib/mail-message-query.test.ts`.

Cases:

1. Flag toggle: JMAP throws → keywords restored to pre-toggle state.
2. Mark read: JMAP throws → `$seen` removed if it was added optimistically.

**Verify**: `cd apps/web && bun run test -- __tests__/hooks/use-mail-keyword-rollback.test.ts` → pass

## Done criteria

- [ ] All six handler paths revert optimistic state on catch
- [ ] User sees `toast.error` on failure (not silent)
- [ ] `mergeMessageIntoMailboxCaches` called on rollback
- [ ] `cd apps/web && bun run typecheck` → exit 0
- [ ] At least one new test covers rollback behavior
- [ ] `plans/README.md` row 003 → DONE

## STOP conditions

- `mergeMessageIntoMailboxCaches` requires fields not on list-row message stubs — read function signature and pass minimal valid `JmapEmailMessage` shape.
- Bulk rollback causes performance issue with 500+ selected messages — cap rollback to selection size already limited by UI; report if not.
- Handler signatures changed since plan written — re-read file and adapt.

## Maintenance notes

- New mail keyword mutations must follow: snapshot → optimistic → API → rollback + toast on failure.
- Do not add blanket `invalidateQueries(["mail"])` on failure — targeted rollback only per AGENTS.md.
