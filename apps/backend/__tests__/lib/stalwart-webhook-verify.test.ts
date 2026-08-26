import { createHmac } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { verifyStalwartWebhookSignature } from "../../lib/stalwart-webhook-verify";

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyStalwartWebhookSignature", () => {
  it("accepts a valid HMAC signature", () => {
    const body = JSON.stringify({ events: [] });
    const secret = "test-secret";

    expect(
      verifyStalwartWebhookSignature({
        body,
        signatureHeader: signBody(body, secret),
        secret,
      }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const body = JSON.stringify({ events: [] });

    expect(
      verifyStalwartWebhookSignature({
        body,
        signatureHeader: "invalid",
        secret: "test-secret",
      }),
    ).toBe(false);
  });

  it("rejects missing headers and secrets", () => {
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, "test-secret");

    expect(
      verifyStalwartWebhookSignature({
        body,
        signatureHeader: null,
        secret: "test-secret",
      }),
    ).toBe(false);
    expect(
      verifyStalwartWebhookSignature({
        body,
        signatureHeader: signature,
        secret: "",
      }),
    ).toBe(false);
  });

  it("rejects signatures with the wrong byte length", () => {
    const body = JSON.stringify({ events: [] });
    const secret = "test-secret";

    expect(
      verifyStalwartWebhookSignature({
        body,
        signatureHeader: Buffer.from("short").toString("base64"),
        secret,
      }),
    ).toBe(false);
  });
});
