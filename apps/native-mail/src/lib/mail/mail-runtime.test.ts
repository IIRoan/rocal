import { resolveMailServerPolicy } from "@workspace/calendar-core";
import { StalwartJmapClient } from "./jmap-client";
import { refreshMailRuntimePolicy, restoreMailRuntime, type MailRuntime } from "./mail-runtime";

jest.mock("./mail-api", () => ({
  createServerMailTokenManager: jest.fn(() => ({ getAccessToken: jest.fn() })),
  getMailConfig: jest.fn(),
  mailFetch: jest.fn(),
}));

jest.mock("./jmap-client", () => ({
  StalwartJmapClient: jest.fn(() => ({
    syncMailServerPolicy: jest.fn(),
    getAccountSettings: jest.fn().mockResolvedValue({ encryptionAtRest: { "@type": "Disabled" } }),
    setMailServerPolicy: jest.fn(),
  })),
  getPrimaryMailAccountId: jest.fn(),
}));

jest.mock("./mail-helpers", () => ({ sortMailboxes: jest.fn((mailboxes) => mailboxes) }));

function createRuntime(): MailRuntime {
  return {
    config: {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "https://mail.solace.onl",
      signupEnabled: true,
      oauth: { mailTokenEndpoint: "https://api.solace.onl/api/mail/oauth/access-token" },
    },
    client: new StalwartJmapClient({ baseUrl: "https://mail.solace.onl", accessToken: "synthetic-token" }),
    session: { apiUrl: "https://mail.solace.onl/jmap/", accounts: {}, primaryAccounts: {} },
    accountId: "acc-1",
    mailboxes: [],
    identities: [
      { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
      { id: "identity-2", email: "alias@solace.onl", name: "Alias" },
    ],
    pickerIdentities: [],
    encryptedAtRest: false,
    mailServerPolicy: resolveMailServerPolicy({}),
  };
}

describe("mail runtime encryption status", () => {
  it("updates identities and encryption from current authoritative settings", async () => {
    const runtime = createRuntime();
    const nextPolicy = resolveMailServerPolicy({ emailSettings: { maxIdentities: 1 } });
    jest.mocked(runtime.client.syncMailServerPolicy).mockResolvedValue(nextPolicy);
    jest.mocked(runtime.client.getAccountSettings).mockResolvedValue({ encryptionAtRest: {
      "@type": "Enabled", publicKey: "synthetic-key", headerProtection: "none",
      encryptOnAppend: false, allowSpamTraining: false,
    } });
    const refreshed = await refreshMailRuntimePolicy(runtime);
    expect(runtime.client.syncMailServerPolicy).toHaveBeenCalledWith(runtime.session, { force: true });
    expect(runtime.client.getAccountSettings).toHaveBeenCalledWith(runtime.session);
    expect(refreshed.mailServerPolicy).toBe(nextPolicy);
    expect(refreshed.pickerIdentities.map((identity) => identity.id)).toEqual(["identity-1"]);
    expect(refreshed.encryptedAtRest).toBe(true);
  });

  it("retains limits while clearing a stale positive encryption flag", async () => {
    const runtime = { ...createRuntime(), encryptedAtRest: true };
    jest.mocked(runtime.client.syncMailServerPolicy).mockResolvedValue(null);
    const refreshed = await refreshMailRuntimePolicy(runtime);
    expect(refreshed.mailServerPolicy).toBe(runtime.mailServerPolicy);
    expect(refreshed.pickerIdentities).toHaveLength(2);
    expect(refreshed.encryptedAtRest).toBe(false);
  });

  it("does not treat a persisted boolean as verified current server policy", () => {
    const runtime = createRuntime();
    expect(restoreMailRuntime({ ...runtime, encryptedAtRest: true }).encryptedAtRest).toBe(false);
  });

  it("rejects retired settings during resume rather than preserving a stale flag", async () => {
    const runtime = createRuntime();
    jest.mocked(runtime.client.getAccountSettings).mockResolvedValue({ encryptionAtRest: { "@type": "Aes256" } });
    await expect(refreshMailRuntimePolicy(runtime)).rejects.toThrow("require an update");
  });
});
