import { getE2eeApiUrl, normalizeApiBaseUrl } from "./e2ee-api-url";

describe("e2ee-api-url", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizeApiBaseUrl("https://api.solace.test///")).toBe(
      "https://api.solace.test",
    );
  });

  it("builds /api-prefixed E2EE endpoints", () => {
    expect(getE2eeApiUrl("https://api.solace.test/", "/bootstrap")).toBe(
      "https://api.solace.test/api/e2ee/bootstrap",
    );
  });
});
