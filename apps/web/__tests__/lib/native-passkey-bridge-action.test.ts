/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { authClient } from "@/lib/auth-client";
import { runNativePasskeyBridgeAction } from "@/lib/native-passkey-bridge-action";

const mockAuthClient = authClient as unknown as {
  $fetch: ReturnType<typeof jest.fn>;
  signIn: { passkey: ReturnType<typeof jest.fn> };
  passkey: { addPasskey: ReturnType<typeof jest.fn> };
};

describe("runNativePasskeyBridgeAction", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: function PublicKeyCredential() { },
    });

    mockAuthClient.$fetch = jest.fn();
    mockAuthClient.signIn = { passkey: jest.fn() };
    mockAuthClient.passkey = { addPasskey: jest.fn() };
  });

  it("returns a cancelled result when the user dismisses the WebAuthn prompt", async () => {
    mockAuthClient.$fetch.mockResolvedValue({
      data: { token: "session-token" },
      error: null,
    });
    mockAuthClient.signIn.passkey.mockResolvedValue({
      data: null,
      error: Object.assign(
        new Error("The operation either timed out or was not allowed."),
        { name: "NotAllowedError" },
      ),
    });

    await expect(
      runNativePasskeyBridgeAction({
        mode: "sign-in",
        callbackURL: "solace://calendar",
        bridgeToken: "bridge-token",
        passkeyName: "This device",
        cancelMessage: "Passkey authentication was cancelled.",
        failureMessage: "Unable to finish passkey verification.",
      }),
    ).resolves.toEqual({
      status: "cancelled",
      message: "Passkey authentication was cancelled.",
    });
  });

  it("returns a cancelled result when WebAuthn throws NotAllowedError", async () => {
    mockAuthClient.$fetch.mockResolvedValue({
      data: { token: "session-token" },
      error: null,
    });
    mockAuthClient.signIn.passkey.mockRejectedValue(
      Object.assign(
        new Error("The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission."),
        { name: "NotAllowedError" },
      ),
    );

    await expect(
      runNativePasskeyBridgeAction({
        mode: "sign-in",
        callbackURL: "solace://calendar",
        bridgeToken: "bridge-token",
        passkeyName: "This device",
        cancelMessage: "Passkey authentication was cancelled.",
        failureMessage: "Unable to finish passkey verification.",
      }),
    ).resolves.toEqual({
      status: "cancelled",
      message: "Passkey authentication was cancelled.",
    });
  });
});
