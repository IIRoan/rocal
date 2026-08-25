import { describe, expect, it } from "@jest/globals";
import {
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeCopy,
  getNativePasskeyBridgeError,
  getNativePasskeyBridgeMode,
  getPasskeyBridgeFreshenRequest,
  getWebAuthnSupportError,
  isPasskeyAuthCancelled,
  isValidNativePasskeyCallbackURL,
  readNativePasskeyBridgeParams,
} from "@/lib/native-passkey-bridge";

describe("native passkey bridge helpers", () => {
  it("recognizes supported native callback schemes", () => {
    expect(isValidNativePasskeyCallbackURL("solace://calendar")).toBe(true);
    expect(
      isValidNativePasskeyCallbackURL("exp://192.168.1.1:8081/--/calendar"),
    ).toBe(true);
    expect(
      isValidNativePasskeyCallbackURL("exps://192.168.1.1:8081/--/calendar"),
    ).toBe(true);
    expect(isValidNativePasskeyCallbackURL("solace-dev://calendar")).toBe(true);
    expect(isValidNativePasskeyCallbackURL("https://app.example.com")).toBe(
      false,
    );
    expect(isValidNativePasskeyCallbackURL("javascript:alert(1)")).toBe(false);
    expect(isValidNativePasskeyCallbackURL(null)).toBe(false);
  });

  it("defaults bridge mode to sign-in", () => {
    expect(getNativePasskeyBridgeMode(null)).toBe("sign-in");
    expect(getNativePasskeyBridgeMode("register")).toBe("register");
  });

  it("reads register mode from search params instead of defaulting to sign-in", () => {
    const search = new URLSearchParams(
      "mode=register&callbackURL=solace-dev:///settings&passkeyName=This+Apple+device",
    );
    expect(readNativePasskeyBridgeParams(search)).toEqual({
      mode: "register",
      callbackURL: "solace-dev:///settings",
      bridgeToken: null,
      passkeyName: "This Apple device",
    });
    expect(getNativePasskeyBridgeCopy("register").title).toBe("Add a passkey");
    expect(getNativePasskeyBridgeCopy("sign-in").title).toBe(
      "Confirm it's you",
    );
  });

  it("appends bridge results onto the native callback url", () => {
    expect(
      buildNativePasskeyCallbackURL("solace://settings", {
        passkeyRegistered: true,
        oneTimeToken: "bridge-token",
      }),
    ).toBe("solace://settings?oneTimeToken=bridge-token&passkeyRegistered=1");
    expect(
      buildNativePasskeyCallbackURL("solace://calendar", {
        oneTimeToken: "login-token",
        passkeyVerified: true,
      }),
    ).toBe("solace://calendar?oneTimeToken=login-token&passkeyVerified=1");
  });

  it("extracts friendly error messages", () => {
    expect(
      getNativePasskeyBridgeError(
        new Error("Passkey sign-in failed."),
        "fallback",
      ),
    ).toBe("Passkey sign-in failed.");
    expect(getNativePasskeyBridgeError(null, "fallback")).toBe("fallback");
    expect(
      getNativePasskeyBridgeError(
        Object.assign(new Error("The operation either timed out or was not allowed."), {
          name: "NotAllowedError",
        }),
        "fallback",
        "Passkey authentication was cancelled.",
      ),
    ).toBe("Passkey authentication was cancelled.");
  });

  it("recognizes WebAuthn cancellation from the browser prompt", () => {
    expect(
      isPasskeyAuthCancelled(
        Object.assign(new Error("The operation either timed out or was not allowed."), {
          name: "NotAllowedError",
        }),
      ),
    ).toBe(true);
    expect(
      isPasskeyAuthCancelled({
        error: { name: "AbortError", message: "The operation was aborted." },
      }),
    ).toBe(true);
    expect(isPasskeyAuthCancelled("Passkey sign-in failed.")).toBe(false);
  });

  it("freshens the webview session only for passkey setup", () => {
    expect(getPasskeyBridgeFreshenRequest("sign-in")).toBeUndefined();
    expect(getPasskeyBridgeFreshenRequest("register")).toEqual({
      path: "/passkey-bridge/freshen-session",
      method: "POST",
    });
  });

  it("reports missing WebAuthn support", () => {
    expect(
      getWebAuthnSupportError({
        isSecureContext: false,
        origin: "http://example.com",
        PublicKeyCredential: function PublicKeyCredential() { },
      }),
    ).toContain("http://example.com");
    expect(
      getWebAuthnSupportError({
        isSecureContext: true,
        origin: "https://app.example.com",
        PublicKeyCredential: undefined,
      }),
    ).toBe("Passkeys are unavailable in this browser.");
    expect(
      getWebAuthnSupportError({
        isSecureContext: true,
        origin: "https://app.example.com",
        PublicKeyCredential: function PublicKeyCredential() { },
      }),
    ).toBeNull();
  });
});
