# Plan 015: Replace raw Tailwind status colors with semantic tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/app/login/_content.tsx apps/web/app/privacy/page.tsx apps/web/components/command-palette/invite-settings.tsx apps/web/components/command-palette/appearance-settings.tsx apps/web/components/subscription-management.tsx apps/web/components/mail/message-reader.tsx apps/web/components/mail/mail-command-palette.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (design consistency)
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

The repo's design rules (AGENTS.md, "UI and Design Consistency") forbid raw Tailwind color scales (`text-emerald-500`, `text-blue-400`, ...) in favor of semantic tokens, and the token system already defines exactly what these call sites need: `--success`, `--warning`, `--info`, `--destructive` are mapped to Tailwind utilities (`text-success`, `bg-info`, ...) in `apps/web/app/globals.css:349-356` and `packages/ui/src/styles/globals.css:348+`, and are already used correctly in places (`home-page-client.tsx:516` uses `bg-success/70`, `message-reader.tsx:2796` uses `text-success`). About a dozen sites bypass the tokens with hand-picked emerald/green/blue/slate classes, each carrying its own `dark:` variant. They drift visually (three different greens for "success") and silently miss future palette changes.

## Current state

Sites to convert (verified at planning time):

| File:line | Current | Replace with |
|---|---|---|
| `apps/web/app/login/_content.tsx:157` | `text-emerald-500` (Check icon) | `text-success` |
| `apps/web/app/login/_content.tsx:164,926,988` | `text-emerald-600 dark:text-emerald-400` | `text-success` |
| `apps/web/app/login/_content.tsx:895,974` | `border-emerald-500 ring-1 ring-emerald-500/30` | `border-success ring-1 ring-success/30` |
| `apps/web/app/privacy/page.tsx:157,168,290` | `text-emerald-600 dark:text-emerald-400` | `text-success` |
| `apps/web/components/command-palette/invite-settings.tsx:42` | `claimed: "text-blue-500 dark:text-blue-400"` | `text-info` |
| `apps/web/components/command-palette/invite-settings.tsx:43` | `accepted: "text-emerald-500 dark:text-emerald-400"` | `text-success` |
| `apps/web/components/command-palette/invite-settings.tsx:109` | `text-emerald-500` | `text-success` |
| `apps/web/components/command-palette/invite-settings.tsx:251` | `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20` | `bg-success/10 text-success border border-success/20` |
| `apps/web/components/subscription-management.tsx:489` | `bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200` ("Synced" badge) | `bg-success/15 text-success` (keep size classes) |
| `apps/web/components/mail/message-reader.tsx:547` | `text-green-500` (copied state) | `text-success` |
| `apps/web/components/command-palette/appearance-settings.tsx:50` | `color: "text-slate-400"` (dark-theme swatch label) | `text-muted-foreground` |
| `apps/web/components/mail/mail-command-palette.tsx:795` | `color: "text-slate-400"` (Dark theme entry) | `text-muted-foreground` |

Token definitions for reference: `apps/web/app/globals.css:190-199` (`--success`, `--warning`, `--info` + foreground/bg/border variants, light theme; dark overrides further down in the same file — confirm dark values exist by searching `--success` in the `.dark` block).

Also at planning time: `invite-settings.tsx:42` `pending: "text-amber-500 dark:text-amber-400"` — amber is the brand primary family; convert to `text-warning` for consistency.

**Intentionally NOT in scope** (decided at audit time, do not convert): `apps/web/components/mail/mail-avatar.tsx` (deterministic per-sender avatar palette, deliberate), `packages/ui/src/components/ui/sonner.tsx` (toast library status colors, shared package), `apps/web/app/home-page-client.tsx:331-402` red current-time markers (marketing demo visuals), `apps/web/app/debug/mails/page.tsx` (email-template preview HTML, must stay literal).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |

## Scope

**In scope** (only these files):
- `apps/web/app/login/_content.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/components/command-palette/invite-settings.tsx`
- `apps/web/components/command-palette/appearance-settings.tsx`
- `apps/web/components/subscription-management.tsx`
- `apps/web/components/mail/message-reader.tsx` (line 547 only)
- `apps/web/components/mail/mail-command-palette.tsx` (line 795 only)

**Out of scope**: everything in the "intentionally NOT in scope" list above; `globals.css` (tokens already exist — do not add or change token values); the native app (uses its own theme tokens already).

## Git workflow

- Branch: `advisor/015-semantic-status-colors`
- Single commit is fine; short imperative message.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm dark-mode token coverage

`rg -n -- '--success|--info|--warning' apps/web/app/globals.css` — confirm each token has a value in BOTH the root/light scope and the `.dark` scope. If `--info` or `--warning` lacks a dark value, STOP (adding token values is a design decision).

**Verify**: both scopes define all three tokens.

### Step 2: Apply the replacements

Make the substitutions from the table. Mechanical rules: drop the `dark:` twin when replacing with a token (tokens flip automatically); keep all non-color classes on each element untouched; where opacity suffixes were used (`emerald-500/30`), keep the same opacity on the token (`success/30`).

**Verify**: `cd apps/web && bun run typecheck` → exit 0; `bun run lint` → exit 0

### Step 3: Sweep for stragglers

`rg -n '(text|bg|border|ring)-(emerald|green|blue|slate)-[0-9]+' apps/web/app apps/web/components --glob '*.tsx' | rg -v 'debug/mails|mail-avatar|home-page-client'` → no matches. If new sites appeared since planning (drift), convert them only if they are unambiguous status colors; otherwise list them in your summary for the next audit.

**Verify**: command returns no matches (or only justified, listed exceptions).

## Test plan

- `cd apps/web && bun run test` → all pass. These are className-only changes; if any snapshot-style test asserts old class strings, update the snapshot and say so.
- No new tests — class substitutions have no testable logic.

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `bun run lint` exits 0
- [ ] `cd apps/web && bun run test` exits 0
- [ ] Step 3 sweep returns no unjustified matches
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `--info` or `--warning` lacks a dark-mode value in `globals.css` (Step 1).
- A listed line no longer matches its "Current" value (drift) and the surrounding code makes the intended status semantic unclear.
- `text-success` etc. fail to resolve as Tailwind utilities in the web app (would mean the `--color-*` theme mapping at `globals.css:349-356` doesn't apply to these files' build — report, do not inline styles).

## Maintenance notes

- Reviewers should reject new raw emerald/green/blue/slate status classes in `apps/web` — point offenders to `text-success` / `text-info` / `text-warning` / `text-destructive`.
- Visual QA note for the reviewer: the success token (`oklch(0.78 0.12 150)`) is slightly different from emerald-500 — intentional; check the login passkey checkmarks and the Synced badge in both themes.
- Deferred: deciding whether `sonner.tsx` (shared package) should adopt the tokens; that touches `packages/ui` consumers beyond this app.
