import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import { webcrypto } from "node:crypto";

import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";
import type { E2eeModule } from "../e2ee-module";

/**
 * Property 11: Password envelope round-trip
 *
 * For any non-empty password, account key, and blind index key, creating a
 * password envelope via `createPasswordEnvelope` and then unwrapping it via
 * `unwrapPasswordEnvelope` with the same password SHALL recover keys that
 * produce identical encryption and blind-index results as the original keys.
 *
 * **Validates: Requirements 11.5**
 */

// ─── Setup ───────────────────────────────────────────────────────────────────

const nodeCrypto: CryptoProvider = webcrypto as unknown as CryptoProvider;

const e2eeModule: E2eeModule = createE2eeModule(nodeCrypto);

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const passwordArb = fc.string({ minLength: 1, maxLength: 64 });

const keyVersionArb = fc.integer({ min: 1, max: 10 });

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("Password envelope round-trip - Property Tests", () => {
  describe("Creating then unwrapping a password envelope recovers equivalent keys", () => {
    it(
      "should recover keys that produce identical encryption and blind-index results",
      async () => {
        await fc.assert(
          fc.asyncProperty(passwordArb, keyVersionArb, async (password, keyVersion) => {
            // Generate fresh keys for each run
            const accountKey = await e2eeModule.generateAccountKey();
            const blindIndexKey = await e2eeModule.generateBlindIndexKey();

            // Create envelope
            const envelope = await e2eeModule.createPasswordEnvelope(
              accountKey,
              blindIndexKey,
              password,
              keyVersion,
            );

            // Unwrap envelope with the same password
            const recovered = await e2eeModule.unwrapPasswordEnvelope(password, envelope);

            // Verify recovered accountKey produces identical encryption results:
            // Encrypt with original key, decrypt with recovered key
            const testPayload = { test: "round-trip-verification" };
            const encrypted = await e2eeModule.encryptJsonPayload(
              accountKey,
              testPayload,
              "test:v1",
            );
            const decrypted = await e2eeModule.decryptJsonPayload<typeof testPayload>(
              recovered.accountKey,
              encrypted,
              "test:v1",
            );
            expect(decrypted.test).toBe(testPayload.test);

            // Also verify the reverse: encrypt with recovered, decrypt with original
            const encrypted2 = await e2eeModule.encryptJsonPayload(
              recovered.accountKey,
              testPayload,
              "test:v1",
            );
            const decrypted2 = await e2eeModule.decryptJsonPayload<typeof testPayload>(
              accountKey,
              encrypted2,
              "test:v1",
            );
            expect(decrypted2.test).toBe(testPayload.test);

            // Verify recovered blindIndexKey produces identical blind index tokens
            const testValue = "calendar meeting";
            const originalTokens = await e2eeModule.createBlindIndexTokens(
              blindIndexKey,
              testValue,
            );
            const recoveredTokens = await e2eeModule.createBlindIndexTokens(
              recovered.blindIndexKey,
              testValue,
            );
            expect(recoveredTokens).toEqual(originalTokens);
          }),
          { numRuns: 20 },
        );
      },
      60_000,
    );
  });

  describe("Unwrapping with a wrong password fails", () => {
    it(
      "should throw an error when unwrapping with a different password",
      async () => {
        await fc.assert(
          fc.asyncProperty(
            passwordArb,
            passwordArb.filter((p) => p.length > 0),
            keyVersionArb,
            async (password, wrongSuffix, keyVersion) => {
              // Ensure the wrong password is actually different
              const wrongPassword = password + wrongSuffix + "!";

              const accountKey = await e2eeModule.generateAccountKey();
              const blindIndexKey = await e2eeModule.generateBlindIndexKey();

              const envelope = await e2eeModule.createPasswordEnvelope(
                accountKey,
                blindIndexKey,
                password,
                keyVersion,
              );

              // Unwrapping with a wrong password should throw
              await expect(
                e2eeModule.unwrapPasswordEnvelope(wrongPassword, envelope),
              ).rejects.toThrow();
            },
          ),
          { numRuns: 20 },
        );
      },
      60_000,
    );
  });
});
