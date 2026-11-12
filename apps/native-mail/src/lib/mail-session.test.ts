import { clearMailSendAttempts, getMailSendAttemptStore } from "@workspace/calendar-core";
import { activateSessionData } from "@workspace/native-core/lib/session-data-lifecycle";
import { QueryClient } from "@tanstack/react-query";
import { MAIL_AUTH_LIFECYCLE, prepareMailSession, restoreMailSession } from "./mail-session";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { buildMailRuntime } from "./mail/mail-runtime";
import { clearAttachmentCache } from "./mail/attachment-cache";
import { holdVaultUnlock } from "./mail/mail-crypto";
import { hydrateMailOfflineSnapshot } from "./mail/mail-offline-snapshot";
import { setMailSyncState } from "./mail/mail-sync";
import { getMailAccountStatus, getMailConfig } from "./mail/mail-api";
import { restoreWithTimeout } from "@workspace/native-core/lib/session-restore";

const mockLoadSnapshot = jest.fn<
  Promise<{ emailState: string } | null>,
  [string]
>();

jest.mock("./mail/account-bootstrap", () => ({
  bootstrapMailboxForAccount: jest.fn(),
}));
jest.mock("./mail/mail-api", () => ({
  getMailAccountStatus: jest.fn(),
  getMailConfig: jest.fn(),
}));
jest.mock("./mail/mail-password-cache", () => ({
  clearCachedPrivateKey: jest.fn(),
  clearDerivedVaultKey: jest.fn(),
  clearMailVaultPassword: jest.fn(),
}));
jest.mock("./mail/mail-settings-store", () => ({
  clearMailSettings: jest.fn(),
}));
jest.mock("./mail/mail-list-settings-store", () => ({
  clearMailListSettings: jest.fn(),
}));
jest.mock("./mail/mail-runtime", () => ({
  buildMailRuntime: jest.fn(async () => ({
    mailboxes: [{ id: "folder-1", name: "Projects" }],
  })),
}));
jest.mock("./mail/mail-sync", () => ({
  getMailSyncState: () => null,
  resetMailSync: jest.fn(),
  setMailSyncState: jest.fn(),
}));
jest.mock("./mail/mail-offline-store", () => ({
  loadMailOfflineSnapshot: (userId: string) => mockLoadSnapshot(userId),
  clearMailOfflineSnapshot: jest.fn(),
}));
jest.mock("./mail/attachment-cache", () => ({
  clearAttachmentCache: jest.fn(async () => undefined),
}));
jest.mock("./mail/mail-offline-snapshot", () => ({
  hydrateMailOfflineSnapshot: jest.fn(),
}));
jest.mock("./mail/mail-crypto", () => ({
  holdVaultUnlock: jest.fn(),
  releaseVaultUnlock: jest.fn(),
  clearVaultCache: jest.fn(),
  ensureVaultLoaded: jest.fn(async () => ({})),
}));

describe("restoreMailSession", () => {
  const queryClient = new QueryClient();
  const input = { queryClient, userId: "u1", isCancelled: () => false };
  const snapshot = { emailState: "s1" };

  beforeEach(() => { activateSessionData("u1"); clearMailSendAttempts(); jest.clearAllMocks(); mockLoadSnapshot.mockReset(); });
  afterEach(() => {
    jest.useRealTimers();
    queryClient.clear();
  });

  it("cancels an old owner's pending attempt on account switch without sign-out", async () => {
    mockLoadSnapshot.mockResolvedValueOnce(null);
    await restoreMailSession(input);
    const previous = getMailSendAttemptStore("stalwart-one").get("pending-scope", "owner@solace.test");
    mockLoadSnapshot.mockResolvedValueOnce(null);
    await restoreMailSession(input);
    expect(getMailSendAttemptStore("stalwart-one").get("pending-scope", "owner@solace.test")).toBe(previous);
    activateSessionData("u2");
    expect(previous.cancelled).toBe(true);
    expect(getMailSendAttemptStore("stalwart-one").get("pending-scope", "owner@solace.test")).not.toBe(previous);
  });

  it("hydrates the current session", async () => {
    mockLoadSnapshot.mockResolvedValueOnce(snapshot);
    await expect(restoreMailSession(input)).resolves.toBe(true);
    expect(hydrateMailOfflineSnapshot).toHaveBeenCalledWith(
      queryClient,
      snapshot,
    );
    expect(holdVaultUnlock).toHaveBeenCalledTimes(1);
    expect(setMailSyncState).toHaveBeenCalledWith("s1");
  });

  it("wipes decrypted attachments on sign-out", async () => {
    await MAIL_AUTH_LIFECYCLE.onSignedOut?.();
    expect(clearAttachmentCache).toHaveBeenCalledTimes(1);
  });

  it("refreshes a recent restored runtime after unlock so locked folder placeholders do not persist", async () => {
    queryClient.setQueryData(QUERY_KEYS.mailRuntime(), {
      mailboxes: [{ id: "folder-1", name: "Encrypted folder" }],
    });
    mockLoadSnapshot.mockResolvedValueOnce(snapshot);
    await restoreMailSession(input);
    await prepareMailSession(input);

    expect(queryClient.getQueryData(QUERY_KEYS.mailRuntime())).toEqual({
      mailboxes: [{ id: "folder-1", name: "Projects" }],
    });
  });

  it("retains the restored runtime when its background refresh is offline", async () => {
    const savedRuntime = { mailboxes: [{ id: "folder-1", name: "Saved projects" }] };
    queryClient.setQueryData(QUERY_KEYS.mailRuntime(), savedRuntime);
    mockLoadSnapshot.mockResolvedValueOnce(snapshot);
    await restoreMailSession(input);
    jest.mocked(buildMailRuntime).mockRejectedValueOnce(new Error("Offline"));

    await expect(prepareMailSession(input)).rejects.toThrow("Offline");
    expect(queryClient.getQueryData(QUERY_KEYS.mailRuntime())).toBe(savedRuntime);
  });

  it.each([false, true])(
    "applies a snapshot that loads after the launch budget only until live preparation begins (retired: %s)",
    async (retiredFirst) => {
      jest.useFakeTimers();
      await MAIL_AUTH_LIFECYCLE.onSignedOut?.();
      jest.clearAllMocks();
      jest.mocked(getMailConfig).mockResolvedValue({ signupEnabled: false } as Awaited<ReturnType<typeof getMailConfig>>);
      jest.mocked(getMailAccountStatus).mockResolvedValue({ provisioned: false } as Awaited<ReturnType<typeof getMailAccountStatus>>);
      let finish: (value: typeof snapshot) => void = () => undefined;
      mockLoadSnapshot.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      let retired = false;
      const restore = restoreWithTimeout(
        (isCancelled) => restoreMailSession({ ...input, isCancelled }),
        () => retired,
      );
      await jest.advanceTimersByTimeAsync(1_500);
      await expect(restore.inTime).resolves.toBe(false);
      retired = retiredFirst;
      finish(snapshot);
      await expect(restore.settled).resolves.toBe(!retiredFirst);
      expect(holdVaultUnlock).toHaveBeenCalledTimes(retiredFirst ? 0 : 1);
      expect(hydrateMailOfflineSnapshot).toHaveBeenCalledTimes(retiredFirst ? 0 : 1);
      expect(setMailSyncState).toHaveBeenCalledTimes(retiredFirst ? 0 : 1);

      jest.useRealTimers();
      await prepareMailSession(input);
      // A refused snapshot must leave live preparation on its full path instead of finishing a restore that never happened.
      expect(getMailConfig).toHaveBeenCalledTimes(retiredFirst ? 1 : 0);
    },
  );

  it.each(["sign-out", "cancellation", "new restore"])(
    "discards a pending snapshot after %s",
    async (reason) => {
      let finish: (value: typeof snapshot) => void = () => undefined;
      let markLoaded: (() => void) | undefined;
      const loaded = new Promise<void>((resolve) => { markLoaded = resolve; });
      mockLoadSnapshot.mockImplementationOnce(() => {
        markLoaded?.();
        return new Promise((resolve) => { finish = resolve; });
      });
      let cancelled = false;
      const restore = restoreMailSession({
        ...input,
        isCancelled: () => cancelled,
      });
      await loaded;
      if (reason === "sign-out") {
        await MAIL_AUTH_LIFECYCLE.onSignedOut?.();
      } else if (reason === "cancellation") {
        cancelled = true;
      } else {
        mockLoadSnapshot.mockResolvedValueOnce(null);
        activateSessionData("u2");
        await restoreMailSession({ ...input, userId: "u2" });
      }
      finish(snapshot);
      await expect(restore).resolves.toBe(false);
      expect(hydrateMailOfflineSnapshot).not.toHaveBeenCalled();
      expect(holdVaultUnlock).not.toHaveBeenCalled();
      expect(setMailSyncState).not.toHaveBeenCalled();
    },
  );
});
