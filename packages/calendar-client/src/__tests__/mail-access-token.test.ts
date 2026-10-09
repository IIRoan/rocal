import { afterEach, expect, it, jest } from "@jest/globals";
import { createMailAccessTokenManager } from "../mail-access-token";

afterEach(() => {
  jest.useRealTimers();
});

it("shares token requests and refreshes at the expiry margin", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-08T12:00:00Z"));
  const loadToken = jest.fn(async () => ({
    accessToken: "fixture-token",
    expiresAtMs: Date.now() + 60_000,
  }));
  const manager = createMailAccessTokenManager(loadToken);
  await Promise.all([manager.getAccessToken(), manager.getAccessToken()]);
  expect(loadToken).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(29_999);
  await manager.getAccessToken();
  expect(loadToken).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await manager.getAccessToken();
  expect(loadToken).toHaveBeenCalledTimes(2);
  manager.clear();
  await manager.getAccessToken();
  expect(loadToken).toHaveBeenCalledTimes(3);
});

it("permits retry after a token request fails", async () => {
  const loadToken = jest
    .fn<() => Promise<{ accessToken: string; expiresAtMs: null }>>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ accessToken: "fixture-token", expiresAtMs: null });
  const manager = createMailAccessTokenManager(loadToken);
  await expect(manager.getAccessToken()).rejects.toThrow("Offline");
  await expect(manager.getAccessToken()).resolves.toBe("fixture-token");
});

it("never replaces a new account's cached token with a late token from the old account", async () => {
  let completeOld: (token: { accessToken: string; expiresAtMs: null }) => void = () => {};
  const loadToken = jest.fn<() => Promise<{ accessToken: string; expiresAtMs: null }>>()
    .mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }))
    .mockResolvedValueOnce({ accessToken: "new-token", expiresAtMs: null });
  const manager = createMailAccessTokenManager(loadToken);
  const oldRequest = manager.getAccessToken();
  const rejectedOld = expect(oldRequest).rejects.toThrow("authorization changed");
  manager.clear();
  await expect(manager.getAccessToken()).resolves.toBe("new-token");
  completeOld({ accessToken: "old-token", expiresAtMs: null });
  await rejectedOld;
  await expect(manager.getAccessToken()).resolves.toBe("new-token");
  expect(loadToken).toHaveBeenCalledTimes(2);
});

it("shares a failed mint among concurrent callers and permits a fresh retry", async () => {
  const loadToken = jest.fn<() => Promise<{ accessToken: string; expiresAtMs: null }>>()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ accessToken: "fresh-token", expiresAtMs: null });
  const manager = createMailAccessTokenManager(loadToken);
  const failed = await Promise.allSettled([manager.getAccessToken(), manager.getAccessToken()]);
  expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect(loadToken).toHaveBeenCalledTimes(1);
  await expect(manager.getAccessToken()).resolves.toBe("fresh-token");
  expect(loadToken).toHaveBeenCalledTimes(2);
});
