import { QueryClient } from "@tanstack/react-query";
import { MAIL_AUTH_LIFECYCLE, prepareMailSession, restoreMailSession } from "./mail-session";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { buildMailRuntime } from "./mail/mail-runtime";
import { clearAttachmentCache } from "./mail/attachment-cache";
import { holdVaultUnlock } from "./mail/mail-crypto";
import { hydrateMailOfflineSnapshot } from "./mail/mail-offline-snapshot";
import { setMailSyncState } from "./mail/mail-sync";

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

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => queryClient.clear());

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

  it.each(["sign-out", "cancellation", "new restore"])(
    "discards a pending snapshot after %s",
    async (reason) => {
      let finish: (value: typeof snapshot) => void = () => undefined;
      mockLoadSnapshot.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      let cancelled = false;
      const restore = restoreMailSession({
        ...input,
        isCancelled: () => cancelled,
      });
      if (reason === "sign-out") {
        await MAIL_AUTH_LIFECYCLE.onSignedOut?.();
      } else if (reason === "cancellation") {
        cancelled = true;
      } else {
        mockLoadSnapshot.mockResolvedValueOnce(null);
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
