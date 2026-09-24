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

  describe("with the real webhook service", () => {
    const notificationJobCreate = jest.fn(async (_args: unknown) => ({ id: "job-1" }));
    const prisma = {
      mailDirectoryEntry: {
        findUnique: jest.fn(async () => ({
          userId: "user-1",
          stalwartAccountId: "n",
          email: "owner@solace.onl",
        })),
      },
      userSettings: {
        findUnique: jest.fn(async () => ({ pushNotifications: true })),
      },
      notificationJob: {
        findFirst: jest.fn(async () => null),
        create: notificationJobCreate,
      },
    };
    const resolveIngestedEmail = jest.fn(
      async (_accountId: string, input: { documentId: string }) => ({
        id: `jmap-${input.documentId}`,
        messageIds:
          input.documentId === "2001"
            ? ["solace-reminder.ff@solace.onl"]
            : [`<${input.documentId}@example.com>`],
      }),
    );

    beforeEach(() => {
      notificationJobCreate.mockClear();
      resolveIngestedEmail.mockClear();
    });

    function realApp() {
      return new Elysia({ normalize: false }).use(
        createStalwartWebhookRoutes(
          new StalwartWebhookService({
            prisma: prisma as never,
            mailSyncService: { resolveIngestedEmail },
          }),
        ),
      );
    }

    async function post(events: unknown[]) {
      const body = JSON.stringify({ events });
      return realApp().handle(
        new Request("http://localhost/internal/stalwart/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature": signBody(body),
          },
          body,
        }),
      );
    }

    it("queues no new_mail job for a Solace reminder mail", async () => {
      const response = await post([
        {
          type: "message-ingest.ham",
          data: {
            accountId: "n",
            documentId: "2000",
            to: ["owner@solace.onl"],
            from: "Reminder in 15 minutes <noreply@solace.onl>",
            messageId: "<solace-reminder.ee@solace.onl>",
          },
        },
      ]);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        processedCount: 1,
        enqueuedCount: 0,
        ignoredCount: 0,
      });
      expect(notificationJobCreate).not.toHaveBeenCalled();
    });

    it("queues exactly one new_mail job when only regular mail is in a mixed batch", async () => {
      const response = await post([
        {
          type: "message-ingest.ham",
          data: { accountId: "n", documentId: "2001", to: ["owner@solace.onl"] },
        },
        {
          type: "message-ingest.ham",
          data: { accountId: "n", documentId: "2002", to: ["owner@solace.onl"] },
        },
      ]);

      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ processedCount: 2, enqueuedCount: 1 }),
      );
      expect(notificationJobCreate).toHaveBeenCalledTimes(1);
      expect(notificationJobCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          kind: "new_mail",
          channel: "push",
          payload: expect.objectContaining({ emailId: "jmap-2002", accountId: "n" }),
        }),
      });
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
