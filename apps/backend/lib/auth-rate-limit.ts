import { createHmac } from "node:crypto";
import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma";
import { errorLogDetails } from "./log-sanitization";

const logger = createLogger("backend:auth-rate-limit");

type RateLimitRule = { window: number; max: number };

type RateLimitRecord = { key: string; count: number; lastRequest: number };

/** Default limit for every Better Auth endpoint without a stricter rule. */
export const AUTH_RATE_LIMIT_DEFAULT: RateLimitRule = { window: 60, max: 100 };

/** Per-path limits, relative to the Better Auth base path and keyed per client IP. */
export const AUTH_RATE_LIMIT_RULES: Record<string, RateLimitRule | false> = {
  // The session token is not guessable, and skipping avoids a database write per session check.
  "/get-session": false,
  "/sign-in/*": { window: 60, max: 5 },
  "/sign-up/*": { window: 3600, max: 5 },
  "/passkey/generate-authenticate-options": { window: 60, max: 10 },
  "/passkey/verify-authentication": { window: 60, max: 10 },
  "/passkey/generate-register-options": { window: 60, max: 10 },
  "/passkey/verify-registration": { window: 60, max: 10 },
  "/one-time-token/verify": { window: 60, max: 10 },
  "/request-password-reset": { window: 900, max: 3 },
  "/forget-password": { window: 900, max: 3 },
  "/reset-password": { window: 900, max: 5 },
  "/reset-password/*": { window: 900, max: 10 },
  "/send-verification-email": { window: 900, max: 3 },
  "/verify-email": { window: 900, max: 10 },
  "/change-password": { window: 900, max: 5 },
  "/change-email": { window: 900, max: 3 },
  "/verify-password": { window: 900, max: 5 },
  "/delete-user": { window: 900, max: 3 },
  "/delete-user/callback": { window: 900, max: 5 },
};

const MAX_RULE_WINDOW_SECONDS = Math.max(
  AUTH_RATE_LIMIT_DEFAULT.window,
  ...Object.values(AUTH_RATE_LIMIT_RULES).map((rule) => (rule ? rule.window : 0)),
);
const PRUNE_INTERVAL_MS = 5 * 60_000;

type RateLimitPrisma = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

/** Better Auth keys contain the client IP, so the table stores only a keyed HMAC of them. */
export function hashRateLimitKey(key: string, secret: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

/** Postgres-backed so limits hold across serverless instances; `consume` is one atomic upsert. */
export function createAuthRateLimitStorage(
  prisma: RateLimitPrisma,
  secret: string,
) {
  let lastPruneAt = 0;

  const pruneExpiredRows = (now: number) => {
    if (now - lastPruneAt < PRUNE_INTERVAL_MS) {
      return;
    }
    lastPruneAt = now;
    const cutoff = BigInt(now - MAX_RULE_WINDOW_SECONDS * 1000);
    void prisma
      .$executeRaw`DELETE FROM "rate_limit" WHERE "last_request" < ${cutoff}`
      .catch((error: unknown) => {
        logger.warn("Failed to prune auth rate limit rows", errorLogDetails(error));
      });
  };

  return {
    async get(key: string): Promise<RateLimitRecord | null> {
      const hashedKey = hashRateLimitKey(key, secret);
      const rows = await prisma.$queryRaw<
        Array<{ count: number; last_request: bigint }>
      >`SELECT "count", "last_request" FROM "rate_limit" WHERE "key" = ${hashedKey}`;
      const row = rows[0];
      return row
        ? { key, count: row.count, lastRequest: Number(row.last_request) }
        : null;
    },

    async set(key: string, value: RateLimitRecord): Promise<void> {
      const hashedKey = hashRateLimitKey(key, secret);
      const lastRequest = BigInt(value.lastRequest);
      await prisma.$executeRaw`
        INSERT INTO "rate_limit" ("key", "count", "last_request")
        VALUES (${hashedKey}, ${value.count}, ${lastRequest})
        ON CONFLICT ("key") DO UPDATE
          SET "count" = EXCLUDED."count", "last_request" = EXCLUDED."last_request"`;
    },

    async consume(
      key: string,
      rule: RateLimitRule,
    ): Promise<{ allowed: boolean; retryAfter: number | null }> {
      const hashedKey = hashRateLimitKey(key, secret);
      const nowMs = Date.now();
      const now = BigInt(nowMs);
      const windowStart = BigInt(nowMs - rule.window * 1000);
      const deniedCount = rule.max + 1;

      // In ON CONFLICT ... SET, column references are the pre-update values.
      const rows = await prisma.$queryRaw<
        Array<{ count: number; last_request: bigint }>
      >`
        INSERT INTO "rate_limit" ("key", "count", "last_request")
        VALUES (${hashedKey}, 1, ${now})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "rate_limit"."last_request" <= ${windowStart} THEN 1
            ELSE LEAST("rate_limit"."count" + 1, ${deniedCount})
          END,
          "last_request" = CASE
            WHEN "rate_limit"."last_request" <= ${windowStart}
              OR "rate_limit"."count" < ${rule.max} THEN ${now}
            ELSE "rate_limit"."last_request"
          END
        RETURNING "count", "last_request"`;

      pruneExpiredRows(nowMs);

      const row = rows[0];
      if (!row || row.count <= rule.max) {
        return { allowed: true, retryAfter: null };
      }

      const retryAfterMs = Number(row.last_request) + rule.window * 1000 - nowMs;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    },
  };
}
