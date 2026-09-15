import { describe, expect, it, jest } from "@jest/globals";
import {
  AUTH_RATE_LIMIT_RULES,
  createAuthRateLimitStorage,
  hashRateLimitKey,
} from "../../lib/auth-rate-limit";
import { getClientIp, TRUSTED_CLIENT_IP_HEADERS } from "../../lib/rate-limit";

const SECRET = "x".repeat(32);

function sqlText(call: unknown[]): string {
  const [strings] = call as [TemplateStringsArray];
  return strings.join("?");
}

function createPrismaMock(rows: Array<{ count: number; last_request: bigint }>) {
  return {
    $queryRaw: jest.fn(async (..._args: unknown[]) => rows),
    $executeRaw: jest.fn(async (..._args: unknown[]) => 0),
  };
}

describe("auth rate limit storage", () => {
  it("never sends the raw IP-bearing key to the database", async () => {
    const prisma = createPrismaMock([{ count: 1, last_request: BigInt(Date.now()) }]);
    const storage = createAuthRateLimitStorage(prisma as never, SECRET);

    await storage.consume("203.0.113.7|/sign-in/email", { window: 60, max: 5 });

    const call = prisma.$queryRaw.mock.calls[0] ?? [];
    expect(JSON.stringify(call, (_k, v) => (typeof v === "bigint" ? String(v) : v))).not.toContain(
      "203.0.113.7",
    );
    expect(call).toContain(hashRateLimitKey("203.0.113.7|/sign-in/email", SECRET));
    expect(sqlText(call)).toContain("ON CONFLICT");
  });

  it("allows while the counter is within the limit", async () => {
    const prisma = createPrismaMock([{ count: 5, last_request: BigInt(Date.now()) }]);
    const storage = createAuthRateLimitStorage(prisma as never, SECRET);

    await expect(
      storage.consume("k", { window: 60, max: 5 }),
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });

  it("denies with retry-after once the counter passes the limit", async () => {
    const prisma = createPrismaMock([
      { count: 6, last_request: BigInt(Date.now() - 30_000) },
    ]);
    const storage = createAuthRateLimitStorage(prisma as never, SECRET);

    const result = await storage.consume("k", { window: 60, max: 5 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThanOrEqual(29);
    expect(result.retryAfter).toBeLessThanOrEqual(31);
  });

  it("covers credential and account-recovery endpoints with strict rules", () => {
    for (const path of [
      "/sign-in/*",
      "/sign-up/*",
      "/passkey/verify-authentication",
      "/passkey/generate-authenticate-options",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
    ]) {
      const rule = AUTH_RATE_LIMIT_RULES[path];
      expect(rule && rule.max).toBeLessThanOrEqual(10);
    }
  });
});

describe("getClientIp", () => {
  it("uses the platform-set headers and ignores non-IP values", () => {
    expect(TRUSTED_CLIENT_IP_HEADERS).toEqual(["x-real-ip", "x-forwarded-for"]);
    expect(
      getClientIp(
        new Request("https://api.test", {
          headers: { "x-real-ip": "198.51.100.4", "x-forwarded-for": "10.0.0.1" },
        }),
      ),
    ).toBe("198.51.100.4");
    expect(
      getClientIp(
        new Request("https://api.test", {
          headers: { "x-forwarded-for": "2001:db8::1, 10.0.0.1" },
        }),
      ),
    ).toBe("2001:db8::1");
    expect(
      getClientIp(
        new Request("https://api.test", {
          headers: { "x-forwarded-for": "not-an-ip" },
        }),
      ),
    ).toBe("unknown");
  });
});
