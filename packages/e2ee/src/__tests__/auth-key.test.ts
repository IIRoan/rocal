import { describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";
// Shared with the API's unit tests, which derive the same key in Rust.
import vectors from "../../../../apps/backend/tests/fixtures/passwords.json";
import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";

const vector = vectors.authKey;

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
const e2eeModule = createE2eeModule(webcrypto as unknown as CryptoProvider);

describe("deriveAuthKey", () => {
  it("matches the key the API derives from a raw password", async () => {
    await expect(
      e2eeModule.deriveAuthKey(vector.password, vector.email),
    ).resolves.toBe(vector.key);
  });

  it("salts with the email so the same password differs per account", async () => {
    const [first, second] = await Promise.all([
      e2eeModule.deriveAuthKey("same-password", "a@solace.test"),
      e2eeModule.deriveAuthKey("same-password", "b@solace.test"),
    ]);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^solace-ak1:[A-Za-z0-9_-]{43}$/);
  });
});
