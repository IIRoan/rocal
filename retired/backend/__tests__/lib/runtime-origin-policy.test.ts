import { describe, expect, it } from "@jest/globals";
import {
  createRuntimeOriginPolicy,
  detectRuntime,
  getRuntimeDisplayName,
} from "@workspace/runtime";

describe("runtime detection", () => {
  it("detects Expo web from a web platform hint", () => {
    const runtime = detectRuntime({ platformOs: "web" });

    expect(runtime.kind).toBe("expo-web");
    expect(runtime.isExpoWeb).toBe(true);
    expect(runtime.isBrowser).toBe(true);
  });

  it("detects Expo Go from native + storeClient hints", () => {
    const runtime = detectRuntime({
      platformOs: "ios",
      expoExecutionEnvironment: "storeClient",
    });

    expect(runtime.kind).toBe("expo-go");
    expect(runtime.isExpoGo).toBe(true);
    expect(getRuntimeDisplayName(runtime)).toBe("Expo Go");
  });

  it("detects Next.js server runtime from NEXT_RUNTIME", () => {
    const runtime = detectRuntime({ nextRuntime: "nodejs" });

    expect(runtime.kind).toBe("nextjs");
    expect(runtime.isNextJs).toBe(true);
    expect(runtime.isServer).toBe(true);
  });
});

describe("runtime origin policy", () => {
  it("allows same-host Expo web origins during local development", () => {
    const policy = createRuntimeOriginPolicy({
      backendUrl: "http://localhost:4001",
      frontendUrl: "http://localhost:4000",
      isProduction: false,
    });
    const request = new Request(
      "http://192.168.2.23:4001/api/auth/get-session",
      {
        headers: {
          Origin: "http://192.168.2.23:8081",
        },
      },
    );

    expect(policy.isOriginAllowed("http://192.168.2.23:8081", request)).toBe(
      true,
    );
    expect(policy.getTrustedOrigins(request)).toContain(
      "http://192.168.2.23:8081",
    );
  });

  it("treats loopback hosts as equivalent in development", () => {
    const policy = createRuntimeOriginPolicy({
      backendUrl: "http://localhost:4001",
      isProduction: false,
    });
    const request = new Request("http://127.0.0.1:4001/api/auth/get-session", {
      headers: {
        Origin: "http://localhost:8081",
      },
    });

    expect(policy.isOriginAllowed("http://localhost:8081", request)).toBe(true);
  });

  it("rejects unrelated origins", () => {
    const policy = createRuntimeOriginPolicy({
      backendUrl: "http://localhost:4001",
      frontendUrl: "http://localhost:4000",
      isProduction: false,
    });
    const request = new Request(
      "http://192.168.2.23:4001/api/auth/get-session",
      {
        headers: {
          Origin: "https://evil.test",
        },
      },
    );

    expect(policy.isOriginAllowed("https://evil.test", request)).toBe(false);
  });

  it("preserves custom trusted origins", () => {
    const policy = createRuntimeOriginPolicy({
      isProduction: false,
      trustedOrigins: ["solace://api/auth"],
    });

    expect(policy.trustedOrigins).toContain("solace://api/auth");
    expect(policy.corsOrigins).toHaveLength(0);
  });
});
