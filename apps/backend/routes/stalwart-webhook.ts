import { Elysia } from "elysia";
import { env } from "../lib/env";
import { RateLimitError } from "../lib/errors";
import { enforceRateLimit, getClientIp } from "../lib/rate-limit";
import { verifyStalwartWebhookSignature } from "../lib/stalwart-webhook-verify";
import { stalwartWebhookPayloadSchema } from "../lib/stalwart-webhook";
import type { StalwartWebhookService } from "../services/stalwart-webhook.service";

export const STALWART_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
const STALWART_WEBHOOK_SIGNED_RATE_LIMIT = { requests: 120, windowMs: 60_000 };
const STALWART_WEBHOOK_UNSIGNED_IP_RATE_LIMIT = { requests: 30, windowMs: 60_000 };

function handleRateLimitError(error: unknown, set: { status?: number | string }) {
  if (error instanceof RateLimitError) {
    set.status = 429;
    return {
      error: "Too many requests",
      message: error.message,
    };
  }
  throw error;
}

export function createStalwartWebhookRoutes(webhookService: StalwartWebhookService) {
  return new Elysia({
    prefix: "/internal/stalwart",
    normalize: false,
  }).post("/webhook", {
    detail: {
      tags: ["Internal"],
      summary: "Receive Stalwart telemetry webhooks",
      description:
        "Accepts signed Stalwart message-ingest.ham events and enqueues native push notifications for linked Solace mailboxes.",
    },
  }, async ({ request, set }) => {
    if (!env.stalwartWebhookSecret) {
      set.status = 503;
      return {
        error: "Service unavailable",
        message: "Stalwart webhook is not configured.",
      };
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > STALWART_WEBHOOK_MAX_BODY_BYTES
    ) {
      set.status = 413;
      return {
        error: "Payload too large",
        message: "Webhook body exceeds the allowed size.",
      };
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > STALWART_WEBHOOK_MAX_BODY_BYTES) {
      set.status = 413;
      return {
        error: "Payload too large",
        message: "Webhook body exceeds the allowed size.",
      };
    }

    const signatureHeader = request.headers.get("X-Signature");
    const signatureValid = verifyStalwartWebhookSignature({
      body: rawBody,
      signatureHeader,
      secret: env.stalwartWebhookSecret,
    });

    if (!signatureValid) {
      try {
        enforceRateLimit({
          storeId: "stalwart-webhook-unsigned",
          key: getClientIp(request),
          limit: STALWART_WEBHOOK_UNSIGNED_IP_RATE_LIMIT,
        });
      } catch (error) {
        return handleRateLimitError(error, set);
      }
      set.status = 401;
      return {
        error: "Unauthorized",
        message: "Invalid webhook signature.",
      };
    }

    try {
      enforceRateLimit({
        storeId: "stalwart-webhook-signed",
        key: "stalwart-ingest",
        limit: STALWART_WEBHOOK_SIGNED_RATE_LIMIT,
      });
    } catch (error) {
      return handleRateLimitError(error, set);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      set.status = 400;
      return {
        error: "Bad request",
        message: "Webhook body must be valid JSON.",
      };
    }

    const payload = stalwartWebhookPayloadSchema.safeParse(parsedBody);
    if (!payload.success) {
      set.status = 400;
      return {
        error: "Bad request",
        message: "Webhook payload is invalid.",
      };
    }

    const result = await webhookService.handlePayload(payload.data);
    return {
      ok: true,
      processedCount: result.processedCount,
      enqueuedCount: result.enqueuedCount,
      ignoredCount: result.ignoredCount,
    };
  });
}
