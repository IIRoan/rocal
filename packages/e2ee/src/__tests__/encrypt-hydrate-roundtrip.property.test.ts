import { describe, it, expect, beforeAll } from "@jest/globals";
import fc from "fast-check";
import { webcrypto } from "node:crypto";

import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";
import type { E2eeModule, EncryptedJsonPayload } from "../e2ee-module";

/**
 * Property 10: E2EE encrypt-hydrate round-trip
 *
 * For any event with a non-empty title, optional description, and optional
 * location, encrypting the event content via `encryptJsonPayload` and then
 * decrypting via `decryptJsonPayload` with the same AES-GCM key SHALL
 * preserve the original title, description, and location values.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3**
 */

// ─── Setup ───────────────────────────────────────────────────────────────────

// Node.js webcrypto satisfies the CryptoProvider interface
const nodeCrypto: CryptoProvider = webcrypto as unknown as CryptoProvider;

const e2eeModule: E2eeModule = createE2eeModule(nodeCrypto);

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const titleArb = fc.string({ minLength: 1, maxLength: 255 });

const descriptionArb = fc.option(fc.string({ maxLength: 1000 }), {
  nil: null,
});

const locationArb = fc.option(fc.string({ maxLength: 500 }), { nil: null });

interface EventContent {
  title: string;
  description: string | null;
  location: string | null;
}

const eventContentArb: fc.Arbitrary<EventContent> = fc.record({
  title: titleArb,
  description: descriptionArb,
  location: locationArb,
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe("E2EE encrypt-hydrate round-trip - Property Tests", () => {
  let accountKey: CryptoKey;

  beforeAll(async () => {
    accountKey = await e2eeModule.generateAccountKey();
  });

  describe("Encrypting then decrypting preserves original event content", () => {
    it(
      "should preserve title, description, and location after encrypt-decrypt round-trip",
      async () => {
        await fc.assert(
          fc.asyncProperty(eventContentArb, async (content) => {
            const payload = {
              title: content.title,
              description: content.description,
              location: content.location,
            };

            const encrypted = await e2eeModule.encryptJsonPayload(
              accountKey,
              payload,
              "event-content:v1",
            );

            const decrypted = await e2eeModule.decryptJsonPayload<EventContent>(
              accountKey,
              encrypted,
              "event-content:v1",
            );

            expect(decrypted.title).toBe(content.title);
            expect(decrypted.description).toBe(content.description);
            expect(decrypted.location).toBe(content.location);
          }),
          { numRuns: 50 },
        );
      },
      30_000,
    );
  });

  describe("Encrypting the same payload twice produces different ciphertexts", () => {
    it(
      "should produce different ciphertexts due to random IV, but both decrypt to the same values",
      async () => {
        await fc.assert(
          fc.asyncProperty(eventContentArb, async (content) => {
            const payload = {
              title: content.title,
              description: content.description,
              location: content.location,
            };

            const encrypted1 = await e2eeModule.encryptJsonPayload(
              accountKey,
              payload,
              "event-content:v1",
            );

            const encrypted2 = await e2eeModule.encryptJsonPayload(
              accountKey,
              payload,
              "event-content:v1",
            );

            // Different IVs should produce different ciphertexts
            expect(
              encrypted1.iv !== encrypted2.iv ||
                encrypted1.ciphertext !== encrypted2.ciphertext,
            ).toBe(true);

            // Both should decrypt to the same original values
            const decrypted1 =
              await e2eeModule.decryptJsonPayload<EventContent>(
                accountKey,
                encrypted1,
                "event-content:v1",
              );

            const decrypted2 =
              await e2eeModule.decryptJsonPayload<EventContent>(
                accountKey,
                encrypted2,
                "event-content:v1",
              );

            expect(decrypted1.title).toBe(content.title);
            expect(decrypted1.description).toBe(content.description);
            expect(decrypted1.location).toBe(content.location);

            expect(decrypted2.title).toBe(content.title);
            expect(decrypted2.description).toBe(content.description);
            expect(decrypted2.location).toBe(content.location);
          }),
          { numRuns: 50 },
        );
      },
      30_000,
    );
  });
});
