import { resolveMailServerPolicy } from "@workspace/calendar-core";
import type { MailRuntime } from "./mail-runtime";

jest.mock("./mail-api", () => ({
  createServerMailTokenManager: jest.fn(),
  getMailConfig: jest.fn(),
  mailFetch: jest.fn(),
}));

jest.mock("./jmap-client", () => ({
  StalwartJmapClient: jest.fn(),
  getPrimaryMailAccountId: jest.fn(),
}));

jest.mock("./mail-helpers", () => ({
  sortMailboxes: jest.fn((mailboxes) => mailboxes),
}));

const { refreshMailRuntimePolicy } = require("./mail-runtime") as typeof import("./mail-runtime");

describe("refreshMailRuntimePolicy", () => {
  function createRuntime(): MailRuntime {
    return {
      config: {
        defaultDomain: "solace.onl",
        discoveryBaseUrl: "https://mail.solace.onl",
        signupEnabled: true,
        oauth: {} as MailRuntime["config"]["oauth"],
        vaultKeyMaterialEndpoint: "https://api.solace.test/api/mail/vault-key-material",
      },
      client: {
        syncMailServerPolicy: jest.fn(),
      } as unknown as MailRuntime["client"],
      session: {} as MailRuntime["session"],
      accountId: "acc-1",
      mailboxes: [],
      identities: [
        { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
        { id: "identity-2", email: "alias@solace.onl", name: "Alias" },
      ],
      pickerIdentities: [
        { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
        { id: "identity-2", email: "alias@solace.onl", name: "Alias" },
      ],
      encryptedAtRest: false,
      mailServerPolicy: resolveMailServerPolicy({}),
    };
  }

  it("updates picker identities from refreshed server policy", async () => {
    const runtime = createRuntime();
    const nextPolicy = resolveMailServerPolicy({
      emailSettings: { maxIdentities: 1 },
    });

    ((runtime.client as any).syncMailServerPolicy as jest.Mock).mockResolvedValue(
      nextPolicy,
    );

    const refreshed = await refreshMailRuntimePolicy(runtime);

    expect((runtime.client as any).syncMailServerPolicy).toHaveBeenCalledWith(
      runtime.session,
      { force: true },
    );
    expect(refreshed.mailServerPolicy).toBe(nextPolicy);
    expect(refreshed.pickerIdentities).toHaveLength(1);
    expect(refreshed.pickerIdentities[0]?.id).toBe("identity-1");
  });

  it("keeps the current policy when refresh returns null", async () => {
    const runtime = createRuntime();

    ((runtime.client as any).syncMailServerPolicy as jest.Mock).mockResolvedValue(null);

    const refreshed = await refreshMailRuntimePolicy(runtime);

    expect(refreshed.mailServerPolicy).toBe(runtime.mailServerPolicy);
    expect(refreshed.pickerIdentities).toHaveLength(2);
  });
});
