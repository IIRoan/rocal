import {
  buildPasskeyBridgeUrl,
  isPasskeyBridgeOriginSecure,
  parsePasskeyBridgeCallback,
  registerBrowserPasskey,
  resolvePasskeyBridgeBaseUrl,
  signInWithBrowserPasskey,
} from "./passkey-browser-bridge";
import type { PasskeyRouteClient } from "./passkey-auth";
import { persistPasskeyStepUpCookie } from "./session-cookie";

jest.mock("expo-linking", () => ({
  createURL: jest.fn((path: string) => `solace://${path.replace(/^\//, "")}`),
}));

jest.mock("./session-cookie", () => ({
  persistPasskeyStepUpCookie: jest.fn(async () => undefined),
}));

function createNoopSubscription() {
  return { remove: jest.fn() };
}

function createRouteClient(
  responses: { data: unknown; error: { message?: string } | null }[],
): PasskeyRouteClient & { $fetch: jest.Mock } {
  return {
    $fetch: jest.fn(async () => responses.shift()),
  } as PasskeyRouteClient & { $fetch: jest.Mock };
}

describe("passkey browser bridge", () => {
  it("derives the web app base url from the API base url for local development", () => {
    expect(resolvePasskeyBridgeBaseUrl("http://192.168.88.246:4001/api")).toBe(
      "http://192.168.88.246:4000",
    );
  });

  it("builds browser bridge urls with the expected query params", () => {
    expect(
      buildPasskeyBridgeUrl({
        appBaseUrl: "https://app.example.com/",
        mode: "register",
        callbackUrl: "solace://settings",
        bridgeToken: "bridge-token",
        passkeyName: "This device",
      }),
    ).toBe(
      "https://app.example.com/passkey/native?mode=register&callbackURL=solace%3A%2F%2Fsettings&bridgeToken=bridge-token&passkeyName=This+device",
    );
  });

  it("parses one-time token and errors from bridge callbacks", () => {
    expect(
      parsePasskeyBridgeCallback(
        "solace://calendar?oneTimeToken=token-1&passkeyRegistered=1",
      ),
    ).toEqual({
      oneTimeToken: "token-1",
      passkeyRegistered: true,
      passkeyVerified: false,
      error: null,
    });
    expect(
      parsePasskeyBridgeCallback(
        "solace://calendar?oneTimeToken=token-2&passkeyVerified=1",
      ),
    ).toEqual({
      oneTimeToken: "token-2",
      passkeyRegistered: false,
      passkeyVerified: true,
      error: null,
    });
  });

  it("requires a secure passkey bridge origin", () => {
    expect(isPasskeyBridgeOriginSecure("https://app.example.com")).toBe(true);
    expect(isPasskeyBridgeOriginSecure("http://localhost:4000")).toBe(true);
    expect(isPasskeyBridgeOriginSecure("http://192.168.88.246:4000")).toBe(
      false,
    );
  });

  it("signs in through the browser bridge and exchanges the one-time token", async () => {
    const routeClient = createRouteClient([
      {
        data: { token: "handoff-ott" },
        error: null,
      },
      {
        data: {
          session: { token: "session-token" },
          user: { id: "user-1" },
        },
        error: null,
      },
      {
        data: { ok: true },
        error: null,
      },
    ]);

    const openAuthSessionAsync = jest.fn(async () => ({
      type: "success",
      url: "solace://calendar?oneTimeToken=bridge-ott&passkeyVerified=1",
    }));

    await expect(
      signInWithBrowserPasskey(routeClient, {
        appBaseUrl: "https://app.example.com",
        createCallbackUrl: () => "solace://calendar",
        addUrlListener: jest.fn(() => createNoopSubscription()),
        openAuthSessionAsync,
      }),
    ).resolves.toEqual({
      session: { token: "session-token" },
      user: { id: "user-1" },
    });

    expect(routeClient.$fetch).toHaveBeenNthCalledWith(
      1,
      "/one-time-token/generate",
      {
        method: "GET",
        throw: false,
      },
    );
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://app.example.com/passkey/native?mode=sign-in&callbackURL=solace%3A%2F%2Fcalendar&bridgeToken=handoff-ott",
      "solace://calendar",
    );
    expect(routeClient.$fetch).toHaveBeenNthCalledWith(
      2,
      "/one-time-token/verify",
      {
        method: "POST",
        body: { token: "bridge-ott" },
        throw: false,
      },
    );
    expect(routeClient.$fetch).toHaveBeenNthCalledWith(
      3,
      "/passkey-bridge/complete-step-up",
      {
        method: "POST",
        body: {},
        throw: false,
      },
    );
    expect(persistPasskeyStepUpCookie).toHaveBeenCalled();
  });

  it("registers a passkey through the browser bridge", async () => {
    const routeClient = createRouteClient([
      {
        data: { token: "setup-ott" },
        error: null,
      },
    ]);

    const openAuthSessionAsync = jest.fn(async () => ({
      type: "success",
      url: "solace://settings?passkeyRegistered=1",
    }));

    await expect(
      registerBrowserPasskey(routeClient, "This device", {
        appBaseUrl: "https://app.example.com",
        createCallbackUrl: () => "solace://settings",
        addUrlListener: jest.fn(() => createNoopSubscription()),
        openAuthSessionAsync,
      }),
    ).resolves.toBeUndefined();

    expect(routeClient.$fetch).toHaveBeenCalledWith(
      "/one-time-token/generate",
      {
        method: "GET",
        throw: false,
      },
    );
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://app.example.com/passkey/native?mode=register&callbackURL=solace%3A%2F%2Fsettings&bridgeToken=setup-ott&passkeyName=This+device",
      "solace://settings",
    );
  });

  it("accepts a callback captured from Linking even when the auth session result is not success", async () => {
    const routeClient = createRouteClient([
      {
        data: { token: "handoff-ott" },
        error: null,
      },
      {
        data: {
          session: { token: "session-token" },
          user: { id: "user-1" },
        },
        error: null,
      },
      {
        data: { ok: true },
        error: null,
      },
    ]);

    let listener: ((url: string) => void) | undefined;

    const resultPromise = signInWithBrowserPasskey(routeClient, {
      appBaseUrl: "https://app.example.com",
      createCallbackUrl: () => "solace:///calendar",
      addUrlListener: jest.fn((nextListener: (url: string) => void) => {
        listener = nextListener;
        return createNoopSubscription();
      }),
      openAuthSessionAsync: jest.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ type: "cancel", url: null }), 0);
          }),
      ),
    });

    while (!listener) {
      await Promise.resolve();
    }
    listener("solace:///calendar?oneTimeToken=bridge-ott");

    await expect(resultPromise).resolves.toEqual({
      session: { token: "session-token" },
      user: { id: "user-1" },
    });
  });
});
