# Plan 001: Harden invite claim atomicity

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 92d2488..HEAD -- apps/backend/services/invite.service.ts apps/backend/__tests__/services/invite.service.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `92d2488`, 2026-06-10

## Why this matters

Invite tokens gate sign-up. Today a `claimed` invite can be claimed again (overwriting `claimedForEmail`), and concurrent claims race with last-write-wins. An attacker with a leaked token can squat a Solace handle or hijack the claim window before the legitimate invitee signs up.

## Current state

- `apps/backend/services/invite.service.ts` — invite lifecycle; `getInviteUnavailableReason` and `claimInviteToken`.
- `apps/backend/routes/account-public.ts:98-116` — public `POST /account/invite/claim` (no auth; by design for pre-sign-up).
- `apps/backend/__tests__/services/invite.service.test.ts` — partial claim tests; no re-claim or concurrency cases.

`getInviteUnavailableReason` does not treat `claimed` as unavailable:

```34:50:apps/backend/services/invite.service.ts
function getInviteUnavailableReason(invite: {
  status: string;
  expiresAt: Date;
}): string | null {
  if (invite.status === "revoked") {
    return "This invite has been revoked.";
  }

  if (invite.status === "accepted") {
    return "This invite has already been used.";
  }

  if (isInviteExpired(invite)) {
    return "This invite has expired.";
  }

  return null;
}
```

`claimInviteToken` unconditionally updates without `WHERE status = 'pending'`:

```259:266:apps/backend/services/invite.service.ts
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: {
        status: "claimed",
        claimedForEmail: chosenEmail,
        claimedAt: new Date(),
      },
    });
```

**Convention**: Service methods return `{ success: false, reason }` for business failures (see existing test at `invite.service.test.ts:80-105`). Use `updateMany` + count check for atomic conditional updates — pattern similar to optimistic locking elsewhere in services.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `cd apps/backend && bun run typecheck` | exit 0 |
| Tests | `cd apps/backend && bun run test -- __tests__/services/invite.service.test.ts` | all pass |
| Full backend tests | `cd /var/home/roan/Documents/rocal && bun run test:backend` | all pass |

## Scope

**In scope**:
- `apps/backend/services/invite.service.ts`
- `apps/backend/__tests__/services/invite.service.test.ts`

**Out of scope**:
- `routes/account-public.ts` — do not add auth to claim endpoint in this plan
- Sign-up hook changes in `lib/auth.ts`
- Database migrations (status enum already includes `claimed`)

## Git workflow

- Branch: `advisor/001-invite-claim-hardening`
- Commit message style: `fix: reject re-claim and race on invite tokens` (matches recent `fix:` commits in log)

## Steps

### Step 1: Treat `claimed` as unavailable

In `getInviteUnavailableReason`, after the `accepted` check, add:

```typescript
if (invite.status === "claimed") {
  return "This invite has already been claimed.";
}
```

Use copy consistent with the `accepted` message tone.

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 2: Atomic conditional claim via `updateMany`

Replace the unconditional `prisma.invite.update` in `claimInviteToken` with:

```typescript
const result = await this.prisma.invite.updateMany({
  where: { id: invite.id, status: "pending" },
  data: {
    status: "claimed",
    claimedForEmail: chosenEmail,
    claimedAt: new Date(),
  },
});

if (result.count === 0) {
  return {
    success: false,
    reason: "This invite is no longer available.",
  };
}
```

Keep all validation (not found, unavailable, email taken) **before** the `updateMany`.

**Verify**: `cd apps/backend && bun run typecheck` → exit 0

### Step 3: Add regression tests

In `invite.service.test.ts`:

1. Mock `invite.findUnique` with `status: "claimed"` → expect `{ success: false, reason: ... }` and `updateMany` not called (add `updateMany` to mock prisma if missing).
2. Mock pending invite + `updateMany` returning `{ count: 0 }` → expect failure reason about invite no longer available.
3. Happy path: pending invite + `updateMany` returning `{ count: 1 }` → `{ success: true }`.

Model mock structure after the existing test at lines 80-105.

**Verify**: `cd apps/backend && bun run test -- __tests__/services/invite.service.test.ts` → all tests pass, ≥3 new or updated cases for claim hardening

## Test plan

- Extend `__tests__/services/invite.service.test.ts` only.
- Cases: re-claim on `claimed`, lost race (`updateMany` count 0), successful claim.
- Verification: `bun run test:backend` from repo root → exit 0

## Done criteria

- [ ] `claimed` invites rejected in `getInviteUnavailableReason`
- [ ] `claimInviteToken` uses `updateMany` with `status: "pending"` guard
- [ ] New tests cover re-claim and race failure
- [ ] `bun run typecheck` and `bun run test:backend` exit 0
- [ ] No files outside scope modified
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `Invite` Prisma model lacks `status` field or uses different enum values than `pending|claimed|accepted|revoked`.
- `updateMany` is unavailable on `invite` in generated Prisma client (report — may need schema check).
- Existing claim flow requires `update` return value for downstream hooks (grep shows none — if found, report).

## Maintenance notes

- If product later binds claim to invitee email only, extend validation in `claimInviteToken` — atomic guard from this plan still applies.
- Reviewers: confirm public claim endpoint behavior unchanged for first successful claim; only re-claim and races are blocked.
