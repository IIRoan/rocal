# Plan 005: Surface inline reply send errors in message reader

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7bcf873..HEAD -- apps/web/components/mail/message-reader.tsx apps/web/__tests__/components/message-reader.test.tsx`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7bcf873`, 2026-06-26

## Why this matters

`handleSendReply` in the message reader wraps `onSendReply` in `try/finally` without `catch`. When `handleQuickReply` throws, the user sees no error toast in the reader (errors are only handled inside `handleQuickReply` when called directly — but `handleSendReply` swallows the rejection path for inline reply UX). Reply text is preserved, which is good, but failures are silent in the inline reply bar.

## Current state

**`handleSendReply`** (`apps/web/components/mail/message-reader.tsx:1030-1045`):

```ts
try {
  await onSendReply(replyText, attachedFiles);
  dispatchMessageUi({ type: "patch", patch: { replyText: "", attachedFiles: [] } });
} finally {
  dispatchMessageUi({ type: "patch", patch: { isSendingReply: false } });
}
```

**Correct pattern in same file's caller chain** — `handleQuickReply` in `use-mail-app.ts:2638-2654` uses `toast.error(getErrorMessage(error, "Could not send reply."))`.

**Imports in message-reader:** `toast` from `sonner` is already used (line 1033). Check for `getErrorMessage` — add from `@/lib/errors` or wherever `use-mail-app` imports it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Message reader tests | `cd apps/web && bun run test -- __tests__/components/message-reader.test.tsx` | all pass |
| Web typecheck | `cd apps/web && bun run typecheck` | exit 0 |

## Scope

**In scope:**

- `apps/web/components/mail/message-reader.tsx` — `handleSendReply` only
- `apps/web/__tests__/components/message-reader.test.tsx` — one new test if feasible

**Out of scope:**

- `handleQuickReply` implementation in `use-mail-app.ts`
- Compose dialog send path

## Git workflow

- Branch: `advisor/005-web-reply-send-error-toast`
- Commit style: `show toast when inline reply send fails`

## Steps

### Step 1: Add catch block to handleSendReply

```ts
try {
  await onSendReply(replyText, attachedFiles);
  dispatchMessageUi({
    type: "patch",
    patch: { replyText: "", attachedFiles: [] },
  });
} catch (error) {
  toast.error(getErrorMessage(error, "Could not send reply."));
} finally {
  dispatchMessageUi({ type: "patch", patch: { isSendingReply: false } });
}
```

Import `getErrorMessage` matching the import path used in `use-mail-app.ts`.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Add test (if practical)

In `message-reader.test.tsx`, add a case:

- Render `MessageReader` with `onSendReply` mock that rejects.
- Trigger inline reply send.
- Assert `toast.error` was called (mock `sonner`).

If the test harness makes this heavy, skip test but document in PR — prefer adding test.

**Verify**: `cd apps/web && bun run test -- __tests__/components/message-reader.test.tsx` → pass

## Test plan

- One component test for error toast on rejected `onSendReply`.
- Manual: force send failure (disconnect network / mock) and confirm toast appears, reply text retained.

## Done criteria

- [ ] `handleSendReply` has `catch` with `toast.error`
- [ ] Successful send still clears reply text
- [ ] `isSendingReply` cleared in `finally` regardless
- [ ] `cd apps/web && bun run typecheck` → exit 0
- [ ] `plans/README.md` row 005 → DONE

## STOP conditions

- `getErrorMessage` not available in web app — find equivalent (`error instanceof Error ? error.message : ...`) and use same copy as quick reply.
- Double toast appears because `onSendReply` also toasts — remove duplicate from one layer only (prefer keeping toast in `handleQuickReply` and skip in reader if already shown — read call chain first).

## Maintenance notes

- Any new async handler in message-reader should follow try/catch/finally with user-visible errors, not bare finally.
