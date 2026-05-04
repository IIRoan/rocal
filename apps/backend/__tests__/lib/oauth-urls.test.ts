import { describe, expect, it } from "@jest/globals";
import { getOAuthProviderCallbackUrl } from "../../lib/oauth-urls";

describe("getOAuthProviderCallbackUrl", () => {
  it("builds the Better Auth provider callback from the backend base url", () => {
    expect(
      getOAuthProviderCallbackUrl(
        "http://192.168.88.246:4001",
        "/api/auth",
        "github",
      ),
    ).toBe("http://192.168.88.246:4001/api/auth/callback/github");
  });

  it("normalizes trailing slashes on the backend base url and base path", () => {
    expect(
      getOAuthProviderCallbackUrl(
        "http://localhost:4001/",
        "/api/auth/",
        "github",
      ),
    ).toBe("http://localhost:4001/api/auth/callback/github");
  });

  it("supports base paths without a leading slash", () => {
    expect(
      getOAuthProviderCallbackUrl(
        "https://api.solace.test",
        "api/auth",
        "github",
      ),
    ).toBe("https://api.solace.test/api/auth/callback/github");
  });
});
