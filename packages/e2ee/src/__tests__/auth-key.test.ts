import { describe, expect, it } from "@jest/globals";
import { webcrypto } from "node:crypto";
import type { CryptoProvider } from "../crypto-provider";
import { createE2eeModule } from "../e2ee-module";

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
const e2eeModule = createE2eeModule(webcrypto as unknown as CryptoProvider);

describe("deriveAuthKey", () => {
  it("matches the key the API derives from a raw password", async () => {
    // The same vector is asserted in `apps/backend/src/auth/password.rs`.
    await expect(
      e2eeModule.deriveAuthKey("solace-test-pw-123", " Person@Solace.test "),
    ).resolves.toBe("solace-ak1:RVi5JAJdWxgw6aLgvytG2Lm2kedP4CA38RkCO9mReJw");
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
