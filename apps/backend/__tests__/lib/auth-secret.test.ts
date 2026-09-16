import { describe, expect, it } from "@jest/globals";
import {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  isDeployedEnvironment,
  resolveBetterAuthSecret,
} from "../../lib/env";

describe("resolveBetterAuthSecret", () => {
  const strong = "s".repeat(BETTER_AUTH_SECRET_MIN_LENGTH);

  it("fails fast in deployed environments when the secret is missing or short", () => {
    expect(() => resolveBetterAuthSecret({ deployed: true })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() =>
      resolveBetterAuthSecret({ deployed: true, secret: "short-secret" }),
    ).toThrow(/at least 32/);
    expect(resolveBetterAuthSecret({ deployed: true, secret: strong })).toBe(strong);
  });

  it("keeps a development fallback only for local and test", () => {
    expect(resolveBetterAuthSecret({ deployed: false })).toMatch(/dev/);
    expect(resolveBetterAuthSecret({ deployed: false, secret: "local" })).toBe("local");
  });

  it("treats NODE_ENV=production and Vercel production/preview as deployed", () => {
    expect(isDeployedEnvironment({ nodeEnv: "production" })).toBe(true);
    expect(isDeployedEnvironment({ nodeEnv: "development", vercelEnv: "preview" })).toBe(true);
    expect(isDeployedEnvironment({ nodeEnv: "test" })).toBe(false);
    expect(isDeployedEnvironment({ nodeEnv: "development", vercelEnv: "development" })).toBe(false);
  });
});
