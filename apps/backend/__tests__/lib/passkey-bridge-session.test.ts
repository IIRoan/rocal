import { describe, expect, it } from "@jest/globals";
import {
  PASSKEY_BRIDGE_FRESHEN_PATH,
  parsePasskeyBridgeSession,
} from "../../lib/passkey-bridge-session-helpers";

describe("passkey bridge fresh session helpers", () => {
  it("exposes the freshen-session path used after native register handoff", () => {
    expect(PASSKEY_BRIDGE_FRESHEN_PATH).toBe("/passkey-bridge/freshen-session");
  });

  it("parses the current Better Auth session payload", () => {
    expect(parsePasskeyBridgeSession(null)).toBeNull();
    expect(parsePasskeyBridgeSession({ user: { id: "user-1" } })).toBeNull();
    expect(
      parsePasskeyBridgeSession({
        session: { token: "session-token" },
        user: { id: "user-1", email: "a@example.com" },
      }),
    ).toEqual({
      session: { token: "session-token" },
      user: { id: "user-1", email: "a@example.com" },
    });
  });
});
