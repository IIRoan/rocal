import { describe, expect, it } from "@jest/globals";
import {
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeError,
  getNativePasskeyBridgeMode,
  isValidNativePasskeyCallbackURL,
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

  it("appends bridge results onto the native callback url", () => {
    expect(
      buildNativePasskeyCallbackURL("solace://settings", {
        passkeyRegistered: true,
        oneTimeToken: "bridge-token",
      }),
    ).toBe("solace://settings?oneTimeToken=bridge-token&passkeyRegistered=1");
  });

  it("extracts friendly error messages", () => {
    expect(
      getNativePasskeyBridgeError(
        new Error("Passkey sign-in failed."),
        "fallback",
      ),
    ).toBe("Passkey sign-in failed.");
    expect(getNativePasskeyBridgeError(null, "fallback")).toBe("fallback");
  });
});
