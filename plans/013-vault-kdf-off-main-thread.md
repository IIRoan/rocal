# Plan 013: Run the mail vault argon2id KDF off the main thread

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3cae505..HEAD -- apps/web/lib/mail/vault-crypto.ts apps/web/workers/mail-crypto.worker.ts apps/web/lib/mail/worker-client.ts apps/web/lib/mail/worker-client-core.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent of 012/014; touches different mail files)
- **Category**: perf
- **Planned at**: commit `3cae505`, 2026-06-10

## Why this matters

Unlocking the encrypted mail vault derives a key with argon2id (`hash-wasm`) **on the main thread**. The modern path uses reduced parameters (8 MiB, 1 iteration — fine, the passphrase is 256-bit server-derived key material), but the legacy password path uses the vault's stored KDF params, which default to 64 MiB memory and 3 iterations — hundreds of ms to seconds of main-thread block during mailbox open, freezing the UI mid-load. The repo already has exactly the right infrastructure: mail PGP work runs in `apps/web/workers/mail-crypto.worker.ts` behind a typed worker client. Moving the KDF there unblocks the UI and also moves the `hash-wasm` import out of the main mail chunk.

## Current state

- `apps/web/lib/mail/vault-crypto.ts` — vault crypto, main thread:

```ts
// :1
import { argon2id } from "hash-wasm";
// :8-10 — the legacy defaults
const DEFAULT_VAULT_MEMORY_KIB = 65536;
const DEFAULT_VAULT_ITERATIONS = 3;
const DEFAULT_VAULT_PARALLELISM = 4;
// :100 export async function createEncryptedMailVault(...)
// :134 export async function unlockEncryptedMailVault(...)
```

Read the whole file (~200 lines): find the internal function that calls `argon2id({...})` (derives the AES key from password + salt + kdfParams). Only the argon2id call must move to the worker; AES-GCM encrypt/decrypt via WebCrypto is natively async and can stay.

- Call sites (`apps/web/hooks/use-mail-app.ts`): `createEncryptedMailVault` at :412 and :2437; `unlockEncryptedMailVault` at :1273, :1287, :1303. All already `await`ed — moving work into a worker does not change call-site shape.

- Worker prior art:
  - `apps/web/workers/mail-crypto.worker.ts` — the existing worker; read its message-handler structure (request/response with ids).
  - `apps/web/lib/mail/worker-client.ts` and `worker-client-core.ts` — the typed client that posts requests and awaits responses. Match this pattern exactly when adding a new operation.

- `KEY_MATERIAL_KDF` reduced params live in `use-mail-app.ts:75-79` — unchanged by this plan; they are passed through as kdfParams.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (web) | `cd apps/web && bun run typecheck` | exit 0 |
| Web tests | `cd apps/web && bun run test` | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope**:
- `apps/web/lib/mail/vault-crypto.ts`
- `apps/web/workers/mail-crypto.worker.ts`
- `apps/web/lib/mail/worker-client.ts` / `worker-client-core.ts` (add one operation)
- A test file for vault-crypto if one exists (`rg --files apps/web | rg -i 'vault.*test|test.*vault'`)

**Out of scope**:
- `use-mail-app.ts` — call sites must keep working unchanged; if they need edits, STOP
- KDF parameter values themselves (security-sensitive; do not "tune" them)
- `packages/e2ee` (calendar E2EE — separate, rejected-for-now finding)

## Git workflow

- Branch: `advisor/013-vault-kdf-off-main-thread`
- One commit per step.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `deriveVaultKey` operation to the worker

In `mail-crypto.worker.ts`, add a message type (follow the existing request/response union in the worker and `worker-client-core.ts`) like:

```ts
{ type: "deriveVaultKey", password: string, saltB64: string, kdfParams: MailVaultKdfParams }
→ { keyB64: string }  // or raw bytes via transferable — match how existing ops return binary
```

Move the `argon2id` import and the derivation function from `vault-crypto.ts` into the worker (or a small shared module imported ONLY by the worker, e.g. `apps/web/lib/mail/vault-kdf.ts`, so the main bundle drops `hash-wasm`).

**Security invariants**: the password crosses to the worker via `postMessage` (same-origin dedicated worker — acceptable, the PGP worker already receives key material this way). Never log the password, derived key, or salt. The derived key bytes return once and are not retained in worker state.

**Verify**: `cd apps/web && bun run typecheck` → exit 0

### Step 2: Route vault-crypto through the worker client

In `vault-crypto.ts`, replace the direct argon2id call inside the derive helper with a call through the worker client (import the client the same way other mail lib files do — check imports of `worker-client` in `apps/web/lib/mail/*.ts`). Function signatures of `createEncryptedMailVault` / `unlockEncryptedMailVault` must not change.

Environment caveat: `vault-crypto.ts` currently has Node fallbacks (`Buffer` branches in base64 helpers), suggesting it may run under Jest/jsdom where `Worker` is unavailable. Check how existing tests handle the PGP worker (search for worker mocks in `apps/web/jest.config.cjs` setup files). Provide the same treatment: either the worker client is mocked in tests, or add a fallback `if (typeof Worker === "undefined") { use direct argon2id import via dynamic import }` — prefer whatever the existing PGP worker tests do.

**Verify**: `cd apps/web && bun run typecheck && cd ../.. && bun run lint` → exit 0; `rg -n 'from "hash-wasm"' apps/web/lib/mail/vault-crypto.ts` → no match.

### Step 3: Tests

**Verify**: `cd apps/web && bun run test` → all pass.

## Test plan

- If vault-crypto has existing tests, they must pass with the worker route (mocked or fallback per Step 2).
- Add a round-trip test (in the existing vault test file, or new `apps/web/__tests__/vault-crypto.test.ts` modeled on neighboring tests): `createEncryptedMailVault(vault, password)` then `unlockEncryptedMailVault(record, password)` returns the original vault; wrong password rejects. Use tiny kdfParams (e.g. memoryKiB: 64, iterations: 1) so the test is fast.
- The cases prove the worker/fallback path derives identical keys to the old direct path — this is the critical regression risk (a derivation mismatch would lock users out of their vaults).

## Done criteria

- [ ] `cd apps/web && bun run typecheck` exits 0
- [ ] `cd apps/web && bun run test` exits 0, including the round-trip test
- [ ] `bun run lint` exits 0
- [ ] `rg -n 'hash-wasm' apps/web/lib/mail/vault-crypto.ts` → no match (import lives only in worker / kdf module)
- [ ] `createEncryptedMailVault` / `unlockEncryptedMailVault` signatures unchanged (`git diff` shows no call-site edits in `use-mail-app.ts`)
- [ ] No KDF parameter values changed anywhere
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `vault-crypto.ts` no longer matches the excerpts (drift).
- The worker client cannot return binary/string results without changing its core protocol (`worker-client-core.ts` restructure needed — report, don't redesign).
- Any existing vault test fails in a way suggesting derived keys differ between old and new paths — this is a data-loss class bug; do not ship a "close enough" version.
- Call sites in `use-mail-app.ts` require edits.

## Maintenance notes

- Anyone adding new vault crypto operations should put CPU-bound work in the worker from the start; reviewers should reject new main-thread `hash-wasm`/argon2 usage.
- The native app has its own vault path — this plan is web-only (worker APIs differ on Hermes); parity does not apply to threading internals, only to vault format, which is unchanged.
- Deferred: profiling calendar E2EE batch decryption for a similar worker offload (audited; do after Plan 006 removes most repeated decryption).
