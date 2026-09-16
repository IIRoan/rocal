import { describe, expect, it } from "@jest/globals";
import { stripSessionClientMetadata } from "../../lib/auth-utils";

describe("stripSessionClientMetadata", () => {
  it("nulls IP address and user agent before a session is stored", () => {
    expect(
      stripSessionClientMetadata({
        userId: "user_1",
        token: "t",
        ipAddress: "203.0.113.9",
        userAgent: "Mozilla/5.0 (iPhone)",
      }),
    ).toEqual({ userId: "user_1", token: "t", ipAddress: null, userAgent: null });
  });
});
