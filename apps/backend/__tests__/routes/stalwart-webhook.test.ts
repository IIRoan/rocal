import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

const env = {
  stalwartWebhookSecret: "webhook-secret",
};

jest.mock("../../lib/env", () => ({
  env,
}));

import {
  createStalwartWebhookRoutes,
  STALWART_WEBHOOK_MAX_BODY_BYTES,
} from "../../routes/stalwart-webhook";
import { StalwartWebhookService } from "../../services/stalwart-webhook.service";

function signBody(body: string, secret = env.stalwartWebhookSecret): string {
  return createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
}

describe("stalwartWebhookRoutes", () => {
  const handlePayload = jest.fn(async () => ({
    processedCount: 1,
    enqueuedCount: 1,
    ignoredCount: 0,
  }));

  beforeEach(() => {
    handlePayload.mockClear();
    env.stalwartWebhookSecret = "webhook-secret";
  });

  function app() {
    return new Elysia({ normalize: false }).use(
      createStalwartWebhookRoutes(
        { handlePayload } as unknown as StalwartWebhookService,
      ),
    );
  }

  it("rejects unsigned webhook requests", async () => {
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: [] }),
      }),
    );

    expect(response.status).toBe(401);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid signature", async () => {
    const body = JSON.stringify({ events: [] });
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body, "wrong-secret"),
        },
        body,
      }),
    );

    expect(response.status).toBe(401);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("returns 503 when the webhook secret is not configured", async () => {
    env.stalwartWebhookSecret = "";
    const body = JSON.stringify({ events: [] });
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(503);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies", async () => {
    const body = "{not-json";
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("rejects invalid payload shapes", async () => {
    const body = JSON.stringify({ events: "not-an-array" });
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const body = "x".repeat(STALWART_WEBHOOK_MAX_BODY_BYTES + 1);
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(413);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it("accepts signed message-ingest.ham payloads", async () => {
    const body = JSON.stringify({
      events: [
        {
          type: "message-ingest.ham",
          data: { accountId: "3", documentId: "16", subject: "Hello" },
        },
      ],
    });

    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(handlePayload).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processedCount: 1,
      enqueuedCount: 1,
      ignoredCount: 0,
    });
  });

  it("returns ignoredCount from the webhook service", async () => {
    handlePayload.mockResolvedValueOnce({
      processedCount: 1,
      enqueuedCount: 1,
      ignoredCount: 2,
    });
    const body = JSON.stringify({ events: [{ type: "telemetry.alert" }] });
    const response = await app().handle(
      new Request("http://localhost/internal/stalwart/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signBody(body),
        },
        body,
      }),
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ignoredCount: 2 }),
    );
  });
});
