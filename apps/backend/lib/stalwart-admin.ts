import { env } from "./env";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type StalwartJmapMethodCall = [string, Record<string, unknown>, string];

export type StalwartJmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
  primaryAccounts?: Record<string, string>;
  accounts?: Record<string, unknown>;
  eventSourceUrl?: string;
};

export type StalwartDomainRecord = {
  id: string;
  name: string;
};

export type StalwartAccountRecord = {
  accountId: string;
};

export interface StalwartAdminClientLike {
  resolveDomainByName(domainName: string): Promise<StalwartDomainRecord>;
  createAccount(input: {
    localPart: string;
    password: string;
    domainId: string;
    description?: string | null;
  }): Promise<StalwartAccountRecord>;
  registerPublicKey(input: {
    accountId: string;
    email: string;
    publicKeyArmored: string;
    description?: string | null;
  }): Promise<{ publicKeyId: string }>;
  enableEncryptionAtRest(input: {
    accountId: string;
    publicKeyId: string;
    encryptOnAppend?: boolean;
    allowSpamTraining?: boolean;
  }): Promise<void>;
}

export interface StalwartJmapAdminClientLike extends StalwartAdminClientLike {
  getSession(): Promise<StalwartJmapEnvelope>;
  callJmap(input: {
    using: string[];
    methodCalls: StalwartJmapMethodCall[];
  }): Promise<StalwartJmapEnvelope>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export class StalwartAdminClient implements StalwartJmapAdminClientLike {
  private readonly baseUrl: string;
  private adminAccountIdPromise: Promise<string> | null = null;

  constructor({
    baseUrl,
    adminToken,
    fetcher = fetch,
  }: {
    baseUrl: string;
    adminToken: string;
    fetcher?: Fetcher;
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.adminToken = adminToken.trim();
    this.fetcher = fetcher;
  }

  private readonly adminToken: string;
  private readonly fetcher: Fetcher;

  async resolveDomainByName(domainName: string): Promise<StalwartDomainRecord> {
    const normalizedName = domainName.trim().toLowerCase();
    const queryEnvelope = await this.postJmap([
      ["x:Domain/query", {}, "c1"],
    ]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:Domain/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    const getEnvelope = await this.postJmap([
      ["x:Domain/get", { ids }, "c1"],
    ]);
    const getResult = this.getMethodResult<{ list?: Array<{ id: string; name: string }> }>(
      getEnvelope,
      "x:Domain/get",
    );

    const domain = (getResult.list ?? []).find(
      (entry) => entry.name.trim().toLowerCase() === normalizedName,
    );

    if (!domain) {
      throw new Error(`Stalwart domain '${domainName}' was not found.`);
    }

    return domain;
  }

  async createAccount(input: {
    localPart: string;
    password: string;
    domainId: string;
    description?: string | null;
  }): Promise<StalwartAccountRecord> {
    const adminAccountId = await this.getAdminAccountId();
    const envelope = await this.postJmap([
      [
        "x:Account/set",
        {
          accountId: adminAccountId,
          create: {
            user1: {
              "@type": "User",
              name: input.localPart,
              domainId: input.domainId,
              description: input.description ?? null,
              credentials: {
                "0": {
                  "@type": "Password",
                  secret: input.password,
                },
              },
            },
          },
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, { description?: string }>;
    }>(envelope, "x:Account/set");
    const created = result.created?.user1;

    if (!created?.id) {
      const reason = result.notCreated?.user1?.description || "Unknown error";
      throw new Error(`Stalwart account creation failed: ${reason}`);
    }

    return {
      accountId: created.id,
    };
  }

  async registerPublicKey(input: {
    accountId: string;
    email: string;
    publicKeyArmored: string;
    description?: string | null;
  }): Promise<{ publicKeyId: string }> {
    const envelope = await this.postJmap([
      [
        "x:PublicKey/set",
        {
          accountId: input.accountId,
          create: {
            pk1: {
              description: input.description ?? null,
              key: input.publicKeyArmored,
              emailAddresses: {
                [input.email]: true,
              },
            },
          },
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, { description?: string }>;
    }>(envelope, "x:PublicKey/set");
    const created = result.created?.pk1;

    if (!created?.id) {
      const reason = result.notCreated?.pk1?.description || "Unknown error";
      throw new Error(`Stalwart public-key registration failed: ${reason}`);
    }

    return {
      publicKeyId: created.id,
    };
  }

  async enableEncryptionAtRest(input: {
    accountId: string;
    publicKeyId: string;
    encryptOnAppend?: boolean;
    allowSpamTraining?: boolean;
  }): Promise<void> {
    await this.postJmap([
      [
        "x:AccountSettings/set",
        {
          accountId: input.accountId,
          update: {
            singleton: {
              encryptionAtRest: {
                "@type": "Aes256",
                publicKey: input.publicKeyId,
                encryptOnAppend: input.encryptOnAppend ?? false,
                allowSpamTraining: input.allowSpamTraining ?? false,
              },
            },
          },
        },
        "c1",
      ],
    ]);
  }

  private async getAdminAccountId(): Promise<string> {
    this.adminAccountIdPromise ??= this.getSession().then((session) => {
      const primaryAccountId =
        session.primaryAccounts?.["urn:stalwart:jmap"] ||
        session.primaryAccounts?.["urn:ietf:params:jmap:mail"] ||
        Object.keys(session.accounts ?? {})[0];

      if (!primaryAccountId) {
        throw new Error(
          "Stalwart admin session did not include a usable account id.",
        );
      }

      return primaryAccountId;
    });

    return this.adminAccountIdPromise;
  }

  async getSession(): Promise<StalwartJmapEnvelope> {
    const response = await this.fetcher(`${this.baseUrl}/jmap/session`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Stalwart admin session request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as StalwartJmapEnvelope;
  }

  async callJmap(input: {
    using: string[];
    methodCalls: StalwartJmapMethodCall[];
  }): Promise<StalwartJmapEnvelope> {
    const response = await this.fetcher(`${this.baseUrl}/jmap/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: input.using,
        methodCalls: input.methodCalls,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Stalwart admin JMAP request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as StalwartJmapEnvelope;
  }

  private getMethodResult<T>(
    envelope: StalwartJmapEnvelope,
    methodName: string,
  ): T {
    const tuple = (envelope.methodResponses ?? []).find(
      (entry) => entry[0] === methodName,
    );

    if (!tuple) {
      throw new Error(`Stalwart JMAP response did not include ${methodName}.`);
    }

    return tuple[1] as T;
  }

  private async postJmap(
    methodCalls: StalwartJmapMethodCall[],
  ): Promise<StalwartJmapEnvelope> {
    return this.callJmap({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls,
    });
  }
}

export function createStalwartAdminClient(config?: {
  baseUrl?: string;
  adminToken?: string;
  fetcher?: Fetcher;
}) {
  return new StalwartAdminClient({
    baseUrl: config?.baseUrl || env.stalwartBaseUrl,
    adminToken: config?.adminToken || env.stalwartAdminToken,
    fetcher: config?.fetcher,
  });
}
