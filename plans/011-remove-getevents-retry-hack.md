# Plan 011: Replace getEvents refetch-on-bad-dates with local date coercion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- packages/calendar-client/src/calendar-api-service.ts packages/calendar-client/src/http-client.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

`getEvents` is the hottest data path in the calendar (called per month range, including prefetches). When any returned event's `start`/`end` is not a `Date` instance, the client sleeps 150 ms and **re-issues the entire range fetch**, then throws a synthetic 502 if it still fails. A deserialization concern is being handled with a duplicated network round-trip: when triggered it doubles calendar load latency and backend load, and it can't actually fix anything — if the HTTP client's date revival missed a field once, an identical refetch will miss it identically. Coercing the dates locally is strictly better.

## Current state

- `packages/calendar-client/src/calendar-api-service.ts:160-198` — the retry:

```ts
async getEvents(start: Date, end: Date, signal?: AbortSignal): Promise<EventsResponse> {
  try {
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const doFetch = async (): Promise<EventsResponse> =>
      await this.client.get<EventsResponse>(
        `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        { signal },
      );

    let response = await doFetch();

    const isComplete = (res: EventsResponse) => {
      if (!res || !Array.isArray(res.events)) return false;
      const datesOk = res.events.every(
        (e) => e && e.start instanceof Date && e.end instanceof Date,
      );
      return datesOk;
    };

    if (!isComplete(response)) {
      await new Promise((r) => setTimeout(r, 150));
      response = await doFetch();
      if (!isComplete(response)) {
        throw {
          error: "Incomplete Data",
          message: "Event data appears incomplete. Please try again in a moment.",
          statusCode: 502,
          details: { reason: "validation_failed" },
        };
      }
    }

    return { ...response,
```

- `packages/calendar-client/src/http-client.ts:~287` — the HTTP client revives ISO date strings to `Date` (`const dateValue = new Date(value);` inside a response transform). Read the surrounding function to understand which keys it revives and why it could miss one.

- Tests for this package: `rg --files packages/calendar-client | rg test` — find the existing test setup (runner and patterns) before writing tests. Repo root `bun run test` runs scripts/run-tests.ts across workspaces.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (consumers) | `cd apps/web && bun run typecheck` | exit 0 |
| Package tests | `cd packages/calendar-client && bun run test` (check package.json scripts; fall back to root `bun run test`) | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope**:
- `packages/calendar-client/src/calendar-api-service.ts` (the `getEvents` method only)
- A test file in `packages/calendar-client` (create or extend)

**Out of scope**:
- `http-client.ts` date revival logic — do not restructure it; the coercion below is the safety net
- Other methods in `calendar-api-service.ts` (`getEvent`, mutations)
- Backend response shape

## Git workflow

- Branch: `advisor/011-remove-getevents-retry-hack`
- Single commit; short imperative message.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace retry with coercion

In `getEvents`, delete `doFetch` retry machinery (`isComplete`, the sleep, the second fetch, the synthetic 502) and replace with a single fetch plus a mapper:

```ts
const response = await this.client.get<EventsResponse>(
  `/api/events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
  { signal },
);

if (!response || !Array.isArray(response.events)) {
  throw {
    error: "Incomplete Data",
    message: "Event data appears incomplete. Please try again in a moment.",
    statusCode: 502,
    details: { reason: "validation_failed" },
  };
}

const events = response.events.map((e) => ({
  ...e,
  start: e.start instanceof Date ? e.start : new Date(e.start),
  end: e.end instanceof Date ? e.end : new Date(e.end),
}));
```

Then continue with whatever the method currently does after the retry block (the `return { ...response, ... }` tail — keep its hydration/normalization intact, but feed it the coerced `events`). If a coerced date is invalid (`Number.isNaN(date.getTime())`), throw the same synthetic 502 — genuinely malformed payloads should still surface as errors, just without the wasted retry. Keep the structural `Array.isArray` guard.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Tests

Add tests for `getEvents` (extend the package's existing test file for this service if one exists; otherwise create one following the package's test conventions found in Step 0 recon):

- events with ISO-string dates → returned with `Date` instances, exactly ONE HTTP call (mock the client and assert call count — this is the regression test for the removed retry)
- events already carrying `Date` instances → passed through, one call
- `start: "not-a-date"` → throws the 502-shaped error
- missing `events` array → throws the 502-shaped error

**Verify**: package tests → all pass; `bun run lint` → exit 0

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] Package tests pass, including the new single-fetch assertion
- [ ] `rg -n 'setTimeout\(r, 150\)' packages/calendar-client/src` → no match
- [ ] `rg -n 'doFetch' packages/calendar-client/src/calendar-api-service.ts` → no match
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `getEvents` no longer matches the excerpt (drift).
- The tail of `getEvents` (after the excerpt) does something with `isComplete`/retry state that the coercion can't replace 1:1.
- You find evidence (comment, linked issue, git blame on the retry block) that the retry exists for a *server-side* eventual-consistency reason rather than deserialization — that would change the fix entirely.
- The native app (`apps/native`) consumes this method through a path that relies on the retry behavior (check `rg -n 'getEvents' apps/native/src | head`).

## Maintenance notes

- If the backend ever changes the events payload shape, this coercion is the single place adapting dates — keep it next to the fetch.
- Reviewer should check git blame on the retry block to confirm the deserialization theory before merging.
- Deferred: auditing `http-client.ts`'s date-revival key matching for the root cause; if found, the coercion stays as a cheap invariant anyway.
