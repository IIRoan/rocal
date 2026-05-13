import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { StalwartAdminClient } from "../../lib/stalwart-admin";

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

describe("StalwartAdminClient", () => {
  let fetcher: jest.MockedFunction<
    (input: string, init?: RequestInit) => Promise<Response>
  >;
  let client: StalwartAdminClient;

  beforeEach(() => {
    fetcher = jest.fn() as jest.MockedFunction<
      (input: string, init?: RequestInit) => Promise<Response>
    >;
    client = new StalwartAdminClient({
      baseUrl: "https://mail.solace.onl/",
      adminToken: "token-1",
      fetcher,
    });
  });

  it("resolves a domain by name through the JMAP registry", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [["x:Domain/query", { ids: ["domain-1"] }, "c1"]],
      }),
    );
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          [
            "x:Domain/get",
            {
              list: [{ id: "domain-1", name: "solace.onl" }],
              notFound: [],
            },
            "c1",
          ],
        ],
      }),
    );

    const domain = await client.resolveDomainByName("solace.onl");

    expect(domain).toEqual({ id: "domain-1", name: "solace.onl" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://mail.solace.onl/jmap/");
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        }),
      }),
    );

    const firstBody = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body ?? "{}"),
    );
    const secondBody = JSON.parse(
      String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"),
    );

    expect(firstBody.methodCalls[0]).toEqual(["x:Domain/query", {}, "c1"]);
    expect(secondBody.methodCalls[0]).toEqual([
      "x:Domain/get",
      { ids: ["domain-1"] },
      "c1",
    ]);
  });

  it("creates an account using the authenticated admin account id", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        primaryAccounts: { "urn:stalwart:jmap": "admin-account" },
      }),
    );
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          [
            "x:Account/set",
            {
              created: {
                user1: {
                  id: "acct-1",
                  emailAddress: "alice@solace.onl",
                },
              },
            },
            "c1",
          ],
        ],
      }),
    );

    const account = await client.createAccount({
      localPart: "alice",
      password: "StrongPassw0rd!",
      domainId: "domain-1",
      description: "Alice Example",
    });

    expect(account).toEqual({ accountId: "acct-1" });

    const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(body.methodCalls[0]).toEqual([
      "x:Account/set",
      {
        accountId: "admin-account",
        create: {
          user1: {
            "@type": "User",
            name: "alice",
            domainId: "domain-1",
            description: "Alice Example",
            credentials: {
              "0": {
                "@type": "Password",
                secret: "StrongPassw0rd!",
              },
            },
          },
        },
      },
      "c1",
    ]);
  });

  it("registers a public key for a target account", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          ["x:PublicKey/set", { created: { pk1: { id: "pk-1" } } }, "c1"],
        ],
      }),
    );

    const result = await client.registerPublicKey({
      accountId: "acct-1",
      email: "alice@solace.onl",
      publicKeyArmored:
        "-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc\n-----END PGP PUBLIC KEY BLOCK-----",
      description: "Primary OpenPGP key",
    });

    expect(result).toEqual({ publicKeyId: "pk-1" });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.methodCalls[0]).toEqual([
      "x:PublicKey/set",
      {
        accountId: "acct-1",
        create: {
          pk1: {
            description: "Primary OpenPGP key",
            key:
              "-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc\n-----END PGP PUBLIC KEY BLOCK-----",
            emailAddresses: {
              "alice@solace.onl": true,
            },
          },
        },
      },
      "c1",
    ]);
  });

  it("enables AES-256 encryption at rest with safe defaults", async () => {
    fetcher.mockResolvedValueOnce(
      jsonResponse({
        methodResponses: [
          ["x:AccountSettings/set", { updated: { singleton: null } }, "c1"],
        ],
      }),
    );

    await client.enableEncryptionAtRest({
      accountId: "acct-1",
      publicKeyId: "pk-1",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.methodCalls[0]).toEqual([
      "x:AccountSettings/set",
      {
        accountId: "acct-1",
        update: {
          singleton: {
            encryptionAtRest: {
              "@type": "Aes256",
              publicKey: "pk-1",
              encryptOnAppend: false,
              allowSpamTraining: false,
            },
          },
        },
      },
      "c1",
    ]);
  });
});
