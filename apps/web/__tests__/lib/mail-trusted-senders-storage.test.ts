/** @jest-environment jsdom */
import { beforeEach, expect, it } from "@jest/globals";
import { encryptJsonPayload, generateAccountKey } from "@/lib/e2ee-crypto";
import {
  clearActiveE2eeSession,
  getActiveE2eeSession,
  setActiveE2eeSession,
} from "@/lib/e2ee-session";
import {
  clearLocalMailSettings,
  clearLocalTrustedSendersMemory,
  MAIL_TRUSTED_SENDERS_STORAGE_KEY,
  readLocalTrustedSenders,
  restoreLocalTrustedSenders,
  writeLocalTrustedSenders,
} from "@/lib/mail/mail-settings-storage";

beforeEach(async () => {
  clearLocalMailSettings();
  clearActiveE2eeSession();
  const accountKey = await generateAccountKey();
  setActiveE2eeSession({
    userId: "user-1",
    deviceId: "device-1",
    accountKey,
    blindIndexKey: accountKey,
    activatedAt: new Date(),
  });
});

it("seals trusted senders and opens them after a reload with the same key", async () => {
  writeLocalTrustedSenders(["alice@example.com"]);
  await restoreLocalTrustedSenders();
  const stored = localStorage.getItem(MAIL_TRUSTED_SENDERS_STORAGE_KEY);
  expect(stored).toBeTruthy();
  expect(stored).not.toContain("alice@example.com");
  clearLocalTrustedSendersMemory();
  expect(readLocalTrustedSenders()).toEqual([]);
  await restoreLocalTrustedSenders();
  expect(readLocalTrustedSenders()).toEqual(["alice@example.com"]);
});

it("does not revive encrypted preferences after sign-out during a write", async () => {
  writeLocalTrustedSenders(["alice@example.com"]);
  const pendingWrite = restoreLocalTrustedSenders();
  clearLocalMailSettings();
  clearActiveE2eeSession();
  await pendingWrite;
  expect(localStorage.getItem(MAIL_TRUSTED_SENDERS_STORAGE_KEY)).toBeNull();
  expect(readLocalTrustedSenders()).toEqual([]);
});

it("retains the latest edit when encryption finishes out of order", async () => {
  writeLocalTrustedSenders(["old@example.com"]);
  writeLocalTrustedSenders(["new@example.com"]);
  await restoreLocalTrustedSenders();
  clearLocalTrustedSendersMemory();
  await restoreLocalTrustedSenders();
  expect(readLocalTrustedSenders()).toEqual(["new@example.com"]);
});

it("keeps another account from reading the local list", async () => {
  writeLocalTrustedSenders(["alice@example.com"]);
  await restoreLocalTrustedSenders();
  const session = getActiveE2eeSession();
  if (!session) throw new Error("Test session missing");
  setActiveE2eeSession({ ...session, userId: "user-2" });
  expect(readLocalTrustedSenders()).toEqual([]);
  await expect(restoreLocalTrustedSenders()).rejects.toThrow();
});

it("does not apply a stale decrypt over a new user edit", async () => {
  const session = getActiveE2eeSession();
  if (!session) throw new Error("Test session missing");
  const sealed = await encryptJsonPayload(
    session.accountKey,
    ["old@example.com"],
    "mail-trusted-senders:v1:user-1",
  );
  localStorage.setItem(
    MAIL_TRUSTED_SENDERS_STORAGE_KEY,
    JSON.stringify(sealed),
  );
  const restore = restoreLocalTrustedSenders();
  writeLocalTrustedSenders(["new@example.com"]);
  await restore;
  await restoreLocalTrustedSenders();
  expect(readLocalTrustedSenders()).toEqual([
    "old@example.com",
    "new@example.com",
  ]);
});

it("removes a sender after hydration without restoring it from the sealed copy", async () => {
  writeLocalTrustedSenders(["old@example.com"]);
  await restoreLocalTrustedSenders();
  writeLocalTrustedSenders([]);
  await restoreLocalTrustedSenders();
  clearLocalTrustedSendersMemory();
  await restoreLocalTrustedSenders();
  expect(readLocalTrustedSenders()).toEqual([]);
});
