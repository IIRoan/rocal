import { Elysia } from "elysia";
import { env } from "../lib/env";
import { RateLimitError } from "../lib/errors";
import { verifyStalwartWebhookSignature } from "../lib/stalwart-webhook-verify";
import { stalwartWebhookPayloadSchema } from "../lib/stalwart-webhook";
import { StalwartWebhookService } from "../services/stalwart-webhook.service";

export const STALWART_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
const STALWART_WEBHOOK_RATE_LIMIT = { requests: 120, windowMs: 60_000 };

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
let lastRateLimitCleanup = 0;

function enforceRateLimit(
  key: string,
  limit: { requests: number; windowMs: number },
) {
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  if (now - lastRateLimitCleanup > limit.windowMs) {
    for (const [storedKey, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(storedKey);
      }
    }
    lastRateLimitCleanup = now;
  }

  const current = rateLimitStore.get(key);
  if (!current || current.resetTime < windowStart) {
    rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs });
    return;
  }

  if (current.count >= limit.requests) {
    const retryAfterSeconds = Math.ceil((current.resetTime - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    );
  }

  current.count++;
}

export function createStalwartWebhookRoutes(webhookService: StalwartWebhookService) {
  return new Elysia({
    prefix: "/internal/stalwart",
    normalize: false,
  }).post(
    "/webhook",
    async ({ request, set }) => {
      if (!env.stalwartWebhookSecret) {
        set.status = 503;
        return {
          error: "Service unavailable",
          message: "Stalwart webhook is not configured.",
        };
      }

      try {
        enforceRateLimit("stalwart-webhook", STALWART_WEBHOOK_RATE_LIMIT);
      } catch (error) {
        if (error instanceof RateLimitError) {
          set.status = 429;
          return {
            error: "Too many requests",
            message: error.message,
          };
        }
        throw error;
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
      if (
        !verifyStalwartWebhookSignature({
          body: rawBody,
          signatureHeader,
          secret: env.stalwartWebhookSecret,
        })
      ) {
        set.status = 401;
        return {
          error: "Unauthorized",
          message: "Invalid webhook signature.",
        };
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
    },
    {
      detail: {
        tags: ["Internal"],
        summary: "Receive Stalwart telemetry webhooks",
        description:
          "Accepts signed Stalwart message-ingest.ham events and enqueues native push notifications for linked Solace mailboxes.",
      },
    },
  );
}
