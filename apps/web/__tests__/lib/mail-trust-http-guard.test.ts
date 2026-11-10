import { afterEach, expect, it, jest } from "@jest/globals";
import { HttpClient, MailTrustApiService } from "@workspace/calendar-client";
import {
  clearActiveE2eeSession,
  getActiveE2eeSession,
  setActiveE2eeSession,
  subscribeActiveE2eeSession,
} from "@/lib/e2ee-session";
import {
  cancelMailTrustReview,
  captureMailTrustGeneration,
} from "@/lib/mail/mail-trust-lifecycle";

afterEach(() => {
  jest.restoreAllMocks();
  clearActiveE2eeSession();
});
it("rejects an old web trust write after clearing and restoring the exact same account/session object", async () => {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const session = {
    userId: "SYNTHETIC-web-owner",
    deviceId: "SYNTHETIC-web-device",
    accountKey: key,
    blindIndexKey: key,
    activatedAt: new Date("2026-11-10T00:00:00.000Z"),
  };
  setActiveE2eeSession(session);
  const unsubscribe = subscribeActiveE2eeSession(cancelMailTrustReview);
  const epochIsCurrent = captureMailTrustGeneration();
  let entered: (() => void) | undefined;
  let resume: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const http = new HttpClient({
    baseURL: "https://api.solace.test",
    getHeaders: async () => {
      entered?.();
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      return {};
    },
  });
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ encryptedTrust: "mt1.SYNTHETIC-web-old" }),
    );
  const api = new MailTrustApiService(
    http,
    () => epochIsCurrent() && getActiveE2eeSession() === session,
  );
  const pending = api.put({
    encryptedTrust: "mt1.SYNTHETIC-web-old",
    expectedEncryptedTrust: null,
  });
  const rejected = expect(pending).rejects.toThrow("session changed");
  await started;
  clearActiveE2eeSession();
  setActiveE2eeSession(session);
  expect(getActiveE2eeSession()).toBe(session);
  resume?.();
  await rejected;
  expect(globalThis.fetch).not.toHaveBeenCalled();
  unsubscribe();
});
