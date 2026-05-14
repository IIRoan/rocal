import { env } from "./env";
import { createLogger } from "@workspace/logger";

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

type StalwartSetError = {
  description?: string;
  type?: string;
  properties?: string[];
  objectId?: {
    object?: string;
    id?: string;
  };
};

const logger = createLogger("backend:stalwart-admin");

export interface StalwartAdminClientLike {
  resolveDomainByName(domainName: string): Promise<StalwartDomainRecord>;
  createAccount(input: {
    localPart: string;
    secret: string;
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
    secret: string;
    domainId: string;
    description?: string | null;
  }): Promise<StalwartAccountRecord> {
    const envelope = await this.postJmap([
      [
        "x:Account/set",
        {
          create: {
            user1: {
              "@type": "User",
              aliases: {},
              credentials: {},
              encryptionAtRest: {
                "@type": "Disabled",
              },
              memberGroupIds: {},
              name: input.localPart,
              domainId: input.domainId,
              permissions: {
                "@type": "Inherit",
              },
              quotas: {},
              roles: {
                "@type": "User",
              },
              description: input.description ?? null,
            },
          },
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      created?: Record<
        string,
        {
          id?: string;
          emailAddress?: string;
          name?: string;
          domainId?: string;
        }
      >;
      notCreated?: Record<string, StalwartSetError>;
    }>(envelope, "x:Account/set");
    const created = result.created?.user1;
    const notCreated = result.notCreated?.user1;

    logger.info("Stalwart createAccount response", {
      requestedLocalPart: input.localPart,
      requestedDomainId: input.domainId,
      created,
      notCreated: notCreated ?? null,
    });

    const accountId = created?.id ?? (await this.recoverExistingAccountId(input, notCreated));

    if (!accountId) {
      const reason = notCreated?.description || "Unknown error";
      throw new Error(`Stalwart account creation failed: ${reason}`);
    }

    const verifiedAccount = await this.getAccount(accountId);
    const requestedLocalPart = input.localPart.trim().toLowerCase();
    const verifiedLocalPart = verifiedAccount.name.trim().toLowerCase();

    if (verifiedLocalPart !== requestedLocalPart) {
      logger.error("Stalwart createAccount resolved to a different mailbox name", {
        requestedLocalPart,
        requestedDomainId: input.domainId,
        returnedAccountId: accountId,
        verifiedEmailAddress: verifiedAccount.emailAddress ?? null,
        verifiedName: verifiedAccount.name,
        verifiedDomainId: verifiedAccount.domainId,
      });
      throw new Error(
        `Stalwart returned a mismatched mailbox after account creation. Requested local part '${requestedLocalPart}' but resolved '${verifiedAccount.name}'.`,
      );
    }

    if (verifiedAccount.domainId !== input.domainId) {
      logger.error("Stalwart createAccount resolved to a different domain id", {
        requestedLocalPart,
        requestedDomainId: input.domainId,
        returnedAccountId: accountId,
        verifiedEmailAddress: verifiedAccount.emailAddress ?? null,
        verifiedName: verifiedAccount.name,
        verifiedDomainId: verifiedAccount.domainId,
      });
      throw new Error(
        `Stalwart returned a mismatched domain id after account creation. Requested '${input.domainId}' but resolved '${verifiedAccount.domainId}'.`,
      );
    }

    await this.setAccountPassword({
      accountId,
      secret: input.secret,
    });

    return {
      accountId,
    };
  }

  private async recoverExistingAccountId(
    input: {
      localPart: string;
      domainId: string;
    },
    error?: StalwartSetError,
  ): Promise<string | null> {
    if (!error) {
      return null;
    }

    const objectId = error.objectId?.id?.trim();
    const propertyTargets = Array.isArray(error.properties) ? error.properties : [];
    const isEmailPrimaryKeyViolation =
      error.type === "primaryKeyViolation" && propertyTargets.includes("email");

    if (!isEmailPrimaryKeyViolation || !objectId) {
      return null;
    }

    logger.warn("Stalwart createAccount reported an existing remote mailbox; attempting recovery", {
      requestedLocalPart: input.localPart,
      requestedDomainId: input.domainId,
      existingAccountId: objectId,
      errorType: error.type,
      properties: propertyTargets,
    });

    return objectId;
  }

  private async getAccount(accountId: string): Promise<{
    id: string;
    name: string;
    domainId: string;
    emailAddress?: string;
  }> {
    const envelope = await this.postJmap([
      [
        "x:Account/get",
        {
          ids: [accountId],
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      list?: Array<{
        id: string;
        name: string;
        domainId: string;
        emailAddress?: string;
      }>;
    }>(envelope, "x:Account/get");

    const account = result.list?.[0];
    if (!account) {
      throw new Error(
        `Stalwart account lookup failed after account creation for id '${accountId}'.`,
      );
    }

    return account;
  }

  private async setAccountPassword(input: {
    accountId: string;
    secret: string;
  }): Promise<void> {
    const envelope = await this.postJmap([
      [
        "x:AccountPassword/set",
        {
          accountId: input.accountId,
          update: {
            singleton: {
              secret: input.secret,
            },
          },
        },
        "c1",
      ],
    ]);

    this.getMethodResult(envelope, "x:AccountPassword/set");
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
