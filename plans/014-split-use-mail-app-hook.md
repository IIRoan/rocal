# Plan 014: Split the use-mail-app god-hook (compose state first)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/hooks/use-mail-app.ts apps/web/components/mail/mail-app.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. NOTE: Plans 010 and 012 touch
> adjacent code and are expected to land first — drift inside the config/
> status loaders or message-list is fine; drift inside compose state is not.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: 012 (lands first; converts config/status to React Query). Coordinate with 010.
- **Category**: tech-debt / perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

`apps/web/hooks/use-mail-app.ts` is 2,589 lines with roughly 40 `useState` calls in one render scope: compose fields, attachment previews, selection, sign-in machinery, and the entire `activeMailbox.messages` array. Because everything lives in one hook consumed at the top of the mail tree, **every keystroke in a compose field re-renders the entire mail surface** (list, reader, sidebar), and any message mutation clones the full messages array. This multiplies the row-rendering cost addressed in Plan 010 and makes the hook nearly unreviewable.

A full rewrite is too risky for one executor pass. This plan does the highest-leverage, lowest-risk slice: **extract compose state into its own hook/context** so typing no longer re-renders the world, and establish the file structure that future extractions (selection, preview, messages-to-React-Query) follow. It deliberately does NOT move `activeMailbox.messages` to React Query — that is a separate, bigger migration listed as deferred.

## Current state

- `apps/web/hooks/use-mail-app.ts` — the god-hook. Map the compose surface first:
  - `rg -n 'useState' apps/web/hooks/use-mail-app.ts | head -50` — identify compose-related state: fields like compose recipients/subject/body, attachments-in-progress, compose open/minimized state, reply/forward draft seeds. Names to search: `compose`, `draft`, `recipient`, `subject`, `body`, `attachment` (case-insensitive).
  - `rg -n 'handleSend|sendMessage|saveDraft' apps/web/hooks/use-mail-app.ts` — the actions that consume compose state.
- `apps/web/components/mail/mail-app.tsx` — top-level mail component consuming the hook and fanning props out to `MessageList`, `MessageReader`, the compose UI, and the sidebar. Find the compose component: `rg -n 'compose' apps/web/components/mail --glob '*.tsx' -i -l`.
- Conventions:
  - Contexts in this app follow `apps/web/components/command-palette-context.tsx` (provider + `useX` hook that throws outside provider) — match it.
  - AGENTS.md mail cache rule: optimistic `setQueryData` on specific keys, no blanket `["mail"]` invalidation — applies to any cache touches you make.
  - Mail query keys: `apps/web/lib/mail/mail-query-keys.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope**:
- `apps/web/hooks/use-mail-app.ts` (removals/wiring only — state moves out)
- New file `apps/web/hooks/use-mail-compose.ts` (or `apps/web/components/mail/mail-compose-context.tsx` if a context is required by the component topology)
- `apps/web/components/mail/mail-app.tsx` and the compose component(s) (re-wiring props to the new hook/context)
- Test files for the moved logic

**Out of scope**:
- Moving `activeMailbox.messages` into React Query (deferred — large migration)
- `handleSignIn` / vault / migration logic
- Message list internals (Plan 010), reader internals
- Any behavior change: send, draft, reply-all, attachment upload must work byte-identically

## Git workflow

- Branch: `advisor/014-split-use-mail-app-hook`
- Commit per step; the tree must typecheck at every commit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory and freeze the compose surface

Produce (in your working notes, then in the PR description) the exact list of: compose `useState`s, derived values, callbacks, and which components consume each (trace through `mail-app.tsx` props). The send/draft actions also need non-compose inputs (account identity, JMAP client/session, queryClient) — list those as the "wiring seam".

**Verify**: post the inventory in your summary; `cd apps/web && bun run typecheck` (unchanged) → exit 0

### Step 2: Create the compose hook/context

Create `MailComposeProvider` + `useMailCompose()` following the `command-palette-context.tsx` pattern. Move the compose `useState`s and pure compose callbacks in. For actions needing the wiring seam (send needs the JMAP client etc.): the provider receives those via props/params from where `useMailApp` runs, OR the action stays in `use-mail-app.ts` and takes the compose payload as an argument (`sendMessage(draft: ComposeDraft)`), with the compose hook owning only the draft state. **Prefer the second shape** — it keeps sign-in/session machinery out of the new file and makes the seam explicit.

Mount the provider inside the mail tree such that ONLY the compose UI subscribes to it (i.e. below `mail-app.tsx`'s top level if possible; if compose UI is a sibling of list/reader, mount at the lowest common ancestor of compose surfaces only).

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 3: Re-wire consumers and delete moved state

Compose components call `useMailCompose()` directly instead of receiving compose props through `mail-app.tsx`. Delete the moved state/props from `use-mail-app.ts` and `mail-app.tsx` prop drilling. The hook should shrink measurably: record before/after `wc -l apps/web/hooks/use-mail-app.ts` in your summary.

**Verify**: `cd apps/web && bun run typecheck && cd ../.. && bun run lint` → exit 0; `cd apps/web && bun run test` → all pass

### Step 4: Confirm the render isolation actually happened

Static check: `rg -n 'useMailCompose' apps/web/components/mail --glob '*.tsx'` — only compose-related components import it; `mail-app.tsx` does not subscribe to compose state (it may render the provider, not consume the hook). If `mail-app.tsx` must consume any compose value (e.g. "is compose open" for layout), isolate that one boolean as a separate context value or prop so keystrokes still don't reach it — keystroke-level state (fields) must not be readable from `mail-app.tsx`.

**Verify**: the rg output above matches the rule; tests still pass.

## Test plan

- Existing mail tests are the primary harness: `cd apps/web && bun run test` → all pass. Compose/send tests (find them: `rg -ln 'compose|send' apps/web/__tests__ -i`) must pass without assertion changes (mock/wiring changes allowed).
- Add `apps/web/__tests__/use-mail-compose.test.ts(x)`: draft fields update independently; `reset`/close clears the draft; the draft object handed to `sendMessage` matches what was typed. Model on an existing hook test in the same dir.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, including new compose tests
- [ ] `bun run lint` exits 0
- [ ] `use-mail-app.ts` line count reduced by at least ~300 lines (report exact numbers)
- [ ] Keystroke-level compose state is not consumed by `mail-app.tsx` (Step 4 check)
- [ ] No behavior change to send/draft flows (existing tests unmodified in their assertions)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Compose state turns out to be entangled with sign-in or message-mutation state such that extraction requires changing `handleSignIn` or message-array handling (out of scope — report the entanglement precisely).
- Any compose/send test requires assertion changes to pass (behavior changed).
- Plans 010/012 have not landed AND their code regions conflict with your diff — coordinate via the index rather than merging around them.
- The extraction balloons past ~6 files changed — the seam was misjudged; report instead of pushing through.

## Maintenance notes

- This establishes the extraction pattern. Next slices, in order of value: (1) selection state → own context; (2) attachment preview state → local to the preview components; (3) `activeMailbox.messages` → React Query via `lib/mail/mail-message-query.ts` (the infrastructure exists), honoring the AGENTS.md optimistic-update rule. Each is a future plan.
- Reviewer should scrutinize: provider mount position (a provider above the whole tree that every keystroke updates would silently recreate the original problem), and draft persistence across compose close/reopen (preserve current behavior, whatever it is — document it in the PR).
