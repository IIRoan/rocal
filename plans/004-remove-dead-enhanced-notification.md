# Plan 004: Delete unused enhanced-notification-service

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 92d2488..HEAD -- apps/backend/lib/enhanced-notification-service.ts`
> If the file was already deleted or gained importers, STOP and report.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `92d2488`, 2026-06-10

## Why this matters

`lib/enhanced-notification-service.ts` is ~3,358 lines with zero imports anywhere in the monorepo. The live notification path is `services/notification.service.ts` (persists rows) plus `apps/notifications` Go worker (sends email). The dead module confuses contributors and agents reviewing notification architecture.

## Current state

- `apps/backend/lib/enhanced-notification-service.ts` — unreferenced singleton.
- `apps/backend/services/notification.service.ts` — active backend notification API.
- `apps/notifications/main.go:317` — worker queries `notification_type = 'email'` only.

Verification at plan time:

```bash
rg "enhanced-notification-service" /var/home/roan/Documents/rocal
# → no matches (no imports)
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm no refs | `rg "enhanced-notification-service|enhancedNotification" apps/backend` | no matches after delete |
| Typecheck | `cd apps/backend && bun run typecheck` | exit 0 |
| Tests | `cd /var/home/roan/Documents/rocal && bun run test:backend` | all pass |

## Scope

**In scope**:
- Delete `apps/backend/lib/enhanced-notification-service.ts`

**Out of scope**:
- Implementing browser notification delivery
- Changes to `notification.service.ts` or Go worker
- `jest.config.cjs` coverage list (file was never in `collectCoverageFrom`)

## Git workflow

- Branch: `advisor/004-remove-dead-enhanced-notification`
- Commit message: `chore: remove unused enhanced-notification-service module`

## Steps

### Step 1: Confirm zero references

Run:

```bash
rg "enhanced-notification-service|EnhancedNotification" /var/home/roan/Documents/rocal
```

If any import exists (excluding the file itself), STOP and report — do not delete.

**Verify**: command returns no import sites

### Step 2: Delete the file

```bash
rm apps/backend/lib/enhanced-notification-service.ts
```

**Verify**: `test ! -f apps/backend/lib/enhanced-notification-service.ts`

### Step 3: Verify build and tests

**Verify**:
- `cd apps/backend && bun run typecheck` → exit 0
- `cd /var/home/roan/Documents/rocal && bun run test:backend` → exit 0

## Test plan

No new tests required — deletion only. Regression coverage via existing `notification.service.test.ts` and `notifications` route tests.

## Done criteria

- [ ] `enhanced-notification-service.ts` deleted
- [ ] `rg` shows no remaining references
- [ ] `bun run typecheck` and `bun run test:backend` exit 0
- [ ] `plans/README.md` updated

## STOP conditions

- Step 1 finds any runtime import or dynamic `import()` of the module.
- Deletion causes typecheck failures — report importer discovered indirectly.

## Maintenance notes

- Browser reminders remain a product gap: backend stores `browser` type rows; Go worker ignores them. Track as a separate direction spike, not part of this deletion.
- Do not reintroduce a second notification dispatcher in the backend — keep Go worker as the sender for email.
