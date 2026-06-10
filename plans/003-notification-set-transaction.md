# Plan 003: Wrap notification writes in Prisma transactions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 92d2488..HEAD -- apps/backend/services/notification.service.ts apps/backend/__tests__/services/notification.service.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `92d2488`, 2026-06-10

## Why this matters

`NotificationService.setForEvent` updates the event reminder field, deletes existing notifications, then creates new rows — three separate awaits with no transaction. A failure mid-sequence leaves reminders and notification rows inconsistent, causing missed or duplicate emails from the Go worker.

## Current state

- `apps/backend/services/notification.service.ts` — `setForEvent` (lines ~143-320) and `deleteForEvent` (lines ~322-347).
- `apps/backend/__tests__/services/notification.service.test.ts` — unit tests with mocked prisma.

Non-atomic `setForEvent` core:

```188:190:apps/backend/services/notification.service.ts
    await this.reconcileEventReminderField(event.id, reminderMinutes);

    await this.prisma.eventNotification.deleteMany({ where: { eventId } });
```

```293:296:apps/backend/services/notification.service.ts
    if (notificationsToCreate.length > 0) {
      await this.prisma.eventNotification.createMany({
        data: notificationsToCreate,
      });
```

Non-atomic `deleteForEvent`:

```336:340:apps/backend/services/notification.service.ts
    const deleteResult = await this.prisma.eventNotification.deleteMany({
      where: { eventId },
    });

    await this.reconcileEventReminderField(event.id, null);
```

**Exemplar transaction pattern** — `apps/backend/services/settings.service.ts:132` uses `this.prisma.$transaction(async (tx) => { ... })`.

`reconcileEventReminderField` is a private method on the same class — refactor it to accept `Prisma.TransactionClient` or inline the `calendarEvent.update` inside the transaction callback.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd apps/backend && bun run typecheck` | exit 0 |
| Notification tests | `cd apps/backend && bun run test -- __tests__/services/notification.service.test.ts` | all pass |
| Full backend | `cd /var/home/roan/Documents/rocal && bun run test:backend` | exit 0 |

## Scope

**In scope**:
- `apps/backend/services/notification.service.ts`
- `apps/backend/__tests__/services/notification.service.test.ts`

**Out of scope**:
- Go notifications worker (`apps/notifications`)
- Browser notification delivery (separate direction item)
- `lib/enhanced-notification-service.ts` (dead code — see plan 004)

## Git workflow

- Branch: `advisor/003-notification-set-transaction`
- Commit message: `fix: make notification set/delete atomic with prisma transactions`

## Steps

### Step 1: Add transaction client support to reminder reconciliation

Change `reconcileEventReminderField` signature to:

```typescript
private async reconcileEventReminderField(
  tx: Prisma.TransactionClient | PrismaClient,
  eventId: string,
  reminderMinutes: number | null,
): Promise<void>
```

Use `tx.calendarEvent.update` instead of `this.prisma.calendarEvent.update`. Update any direct callers (grep within the file).

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 2: Wrap `setForEvent` writes in `$transaction`

After building `notificationsToCreate` (and early-return paths for past events — those can stay outside the transaction since they don't mutate), wrap:

- `reconcileEventReminderField(tx, ...)`
- `tx.eventNotification.deleteMany`
- `tx.eventNotification.createMany`

inside:

```typescript
await this.prisma.$transaction(async (tx) => {
  await this.reconcileEventReminderField(tx, event.id, reminderMinutes);
  await tx.eventNotification.deleteMany({ where: { eventId } });
  if (notificationsToCreate.length > 0) {
    await tx.eventNotification.createMany({ data: notificationsToCreate });
  }
});
```

Keep validation and `notificationsToCreate` assembly **before** the transaction.

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 3: Wrap `deleteForEvent` in `$transaction`

```typescript
const deleteResult = await this.prisma.$transaction(async (tx) => {
  const result = await tx.eventNotification.deleteMany({ where: { eventId } });
  await this.reconcileEventReminderField(tx, event.id, null);
  return result;
});
```

**Verify**: `cd apps/backend && bun run test -- __tests__/services/notification.service.test.ts` → pass

### Step 4: Update tests to expect `$transaction`

In the test harness (`createHarness`), add:

```typescript
$transaction: jest.fn(async (callback) => callback(prisma)),
```

Add one test asserting `prisma.$transaction` was called for `setForEvent` happy path and `deleteForEvent`.

**Verify**: `cd /var/home/roan/Documents/rocal && bun run test:backend` → exit 0

## Test plan

- Update mock prisma in `notification.service.test.ts`.
- Assert `$transaction` invoked on set and delete.
- Existing reminder-field tests should still pass unchanged in behavior.

## Done criteria

- [ ] `setForEvent` reminder update + delete + create run in one `$transaction`
- [ ] `deleteForEvent` delete + reminder clear run in one `$transaction`
- [ ] Tests assert transaction usage
- [ ] `bun run typecheck` and `bun run test:backend` exit 0
- [ ] `plans/README.md` updated

## STOP conditions

- `reconcileEventReminderField` calls other services that cannot run inside a transaction — report before widening scope.
- Test harness uses a shared prisma mock that breaks when `$transaction` delegates to callback — fix mock only, do not skip transaction.

## Maintenance notes

- If notification scheduling moves to an outbox pattern, this transaction boundary is the right place to add an outbox insert.
- Reviewers: confirm early returns (past event, no ownership) still avoid opening transactions unnecessarily.
