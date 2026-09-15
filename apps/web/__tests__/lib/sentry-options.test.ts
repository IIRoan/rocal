import { afterEach, describe, expect, it } from "@jest/globals";
import { getWebSentryOptions } from "@/lib/sentry-options";

describe("getWebSentryOptions", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it("scrubs events and breadcrumbs before they are sent", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://publickey@errors.solace.onl/solace";
    const options = getWebSentryOptions();
    expect(options?.sendDefaultPii).toBe(false);

    const event = options?.beforeSend({
      message: "failed for alice@example.com",
      user: { email: "alice@example.com" },
      request: { url: "https://app.solace.onl/mail?q=alice", headers: { Cookie: "s=1" } },
      extra: { title: "Dentist appointment", token: "Bearer abc" },
    });
    expect(JSON.stringify(event)).not.toMatch(/alice|Dentist|abc|Cookie/);

    expect(
      options?.beforeBreadcrumb({ category: "console", message: "x" }),
    ).toBeNull();
  });
});
