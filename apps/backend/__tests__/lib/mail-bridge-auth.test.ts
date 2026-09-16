import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const BRIDGE_KEY = Buffer.alloc(32, 2).toString("base64");

const originalBridgeKey = process.env.MAIL_BRIDGE_HMAC_KEY;

async function deriveSecret() {
  jest.resetModules();
  const { deriveMailBridgeSecret } = await import("../../lib/mail-bridge-auth");
  return deriveMailBridgeSecret({
    userId: "user-1",
    email: "alice@solace.onl",
  });
}

describe("deriveMailBridgeSecret", () => {
  beforeEach(() => {
    process.env.MAIL_BRIDGE_HMAC_KEY = BRIDGE_KEY;
  });

  afterEach(() => {
    process.env.MAIL_BRIDGE_HMAC_KEY = originalBridgeKey;
  });

  it("changes only when the bridge key changes", async () => {
    const withBridgeKey = await deriveSecret();

    process.env.MAIL_BRIDGE_HMAC_KEY = Buffer.alloc(32, 3).toString("base64");
    const withRotatedBridgeKey = await deriveSecret();

    expect(withRotatedBridgeKey).not.toBe(withBridgeKey);

    process.env.MAIL_BRIDGE_HMAC_KEY = BRIDGE_KEY;

    await expect(deriveSecret()).resolves.toBe(withBridgeKey);
  });

  it("fails fast when the bridge key is unset", async () => {
    process.env.MAIL_BRIDGE_HMAC_KEY = "";

    await expect(deriveSecret()).rejects.toThrow("MAIL_BRIDGE_HMAC_KEY");
  });
});
