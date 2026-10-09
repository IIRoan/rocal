import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createMailOAuthTokenManager } from "../../lib/mail/oauth-client";

describe("mail token invalidation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a late token after clear and preserves the new in-flight request", async () => {
    let completeOld: (response: Response) => void = () => {};
    let completeNew: (response: Response) => void = () => {};
    const fetcher = jest
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            completeOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            completeNew = resolve;
          }),
      );
    globalThis.fetch = Object.assign(fetcher, {
      preconnect: originalFetch.preconnect,
    });
    const manager = createMailOAuthTokenManager({
      mailTokenEndpoint: "https://fixture.test/mail-token",
    });
    const oldRequest = manager.getAccessToken();
    const rejectedOld = expect(oldRequest).rejects.toThrow(
      "authorization changed",
    );
    manager.clear();
    const newRequest = manager.getAccessToken();
    completeOld(Response.json({ access_token: "old-token", expires_in: 3600 }));
    await rejectedOld;
    const concurrentRequest = manager.getAccessToken();
    expect(fetcher).toHaveBeenCalledTimes(2);
    completeNew(Response.json({ access_token: "new-token", expires_in: 3600 }));
    await expect(newRequest).resolves.toBe("new-token");
    await expect(concurrentRequest).resolves.toBe("new-token");
    await expect(manager.getAccessToken()).resolves.toBe("new-token");
  });
});
