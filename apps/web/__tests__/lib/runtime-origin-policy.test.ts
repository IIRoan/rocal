import { expect, it } from "@jest/globals";
import { createRuntimeOriginPolicy } from "@workspace/runtime";

it("rejects hostile origins without retrying every slash suffix", () => {
  const policy = createRuntimeOriginPolicy({
    isProduction: true,
    frontendUrl: "https://app.example.com/",
    backendUrl: "https://api.example.com/",
    appUrl: "solace://",
  });
  const origin = `${"/".repeat(100_000)}x`;
  const start = performance.now();
  expect(policy.isOriginAllowed(origin)).toBe(false);
  expect(performance.now() - start).toBeLessThan(1_000);
  expect(policy.isOriginAllowed("https://app.example.com///")).toBe(true);
  expect(policy.isOriginAllowed("https://attacker.example.com")).toBe(false);
});
