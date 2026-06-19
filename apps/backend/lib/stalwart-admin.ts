import { env } from "./env";
import { createLogger } from "@workspace/logger";
import { logRef } from "./log-sanitization";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type StalwartJmapMethodCall = [string, Record<string, unknown>, string];

export type StalwartJmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
  primaryAccounts?: Record<string, string>;
  accounts?: Record<string, unknown>;
  eventSourceUrl?: string;
  uploadUrl?: string;
};

export type StalwartDomainRecord = {
  id: string;
  name: string;
};

export type StalwartAccountRecord = {
  accountId: string;
  /** False when an existing remote mailbox was adopted instead of created. */
  created?: boolean;
};

type StalwartCredentialRecord = Record<string, unknown> & {
  "@type"?: string;
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
  setAccountPassword(input: {
    accountId: string;
    secret: string;
  }): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
  resolveAccountIdByMailbox(input: {
    localPart: string;
    domainId: string;
  }): Promise<string | null>;
  resolveMailboxPublicKey(input: {
    email: string;
  }): Promise<{
    email: string;
    publicKeyArmored: string;
    publicKeyId: string;
    stalwartAccountId: string;
    stalwartDomainId: string;
  } | null>;
  ensureOAuthClient(input: {
    clientId: string;
    redirectUri: string;
    description?: string | null;
  }): Promise<void>;
  issueOAuthAccessToken(input: {
    accountName: string;
    accountSecret: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    codeChallenge: string;
  }): Promise<{
    access_token: string;
    expires_in?: number;
    expires_at?: number;
    refresh_token?: string;
  }>;
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

function toWritableCredential(
  credential: StalwartCredentialRecord,
): StalwartCredentialRecord {
  const rest = { ...credential };
  delete rest.credentialId;
  delete rest.createdAt;
  return rest;
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
    const queryEnvelope = await this.postJmap([["x:Domain/query", {}, "c1"]]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:Domain/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    const getEnvelope = await this.postJmap([["x:Domain/get", { ids }, "c1"]]);
    const getResult = this.getMethodResult<{
      list?: Array<{ id: string; name: string }>;
    }>(getEnvelope, "x:Domain/get");

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
    const requestedLocalPart = input.localPart.trim().toLowerCase();
    const existingAccount = await this.findAccountByMailbox({
      localPart: requestedLocalPart,
      domainId: input.domainId,
    });

    if (existingAccount) {
      logger.info("Reusing existing Stalwart account for mailbox provisioning", {
        requestedLocalPart,
        requestedDomainId: input.domainId,
        existingAccountId: existingAccount.id,
      });

      await this.updateAccountPasswordCredential({
        accountId: existingAccount.id,
        existingCredentials: existingAccount.credentials,
        secret: input.secret,
      });

      return {
        accountId: existingAccount.id,
        created: false,
      };
    }

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

    const accountId =
      created?.id ?? (await this.recoverExistingAccountId(input, notCreated));

    if (!accountId) {
      const reason = notCreated?.description || "Unknown error";
      throw new Error(`Stalwart account creation failed: ${reason}`);
    }

    const verifiedAccount = await this.getAccount(accountId);
    const verifiedLocalPart = verifiedAccount.name.trim().toLowerCase();

    if (verifiedLocalPart !== requestedLocalPart) {
      logger.error(
        "Stalwart createAccount resolved to a different mailbox name",
        {
          requestedLocalPart,
          requestedDomainId: input.domainId,
          returnedAccountId: accountId,
          verifiedEmailAddress: verifiedAccount.emailAddress ?? null,
          verifiedName: verifiedAccount.name,
          verifiedDomainId: verifiedAccount.domainId,
        },
      );
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

    await this.updateAccountPasswordCredential({
      accountId,
      existingCredentials: verifiedAccount.credentials,
      secret: input.secret,
    });

    return {
      accountId,
      created: Boolean(created?.id),
    };
  }

  private async findAccountByMailbox(input: {
    localPart: string;
    domainId: string;
  }): Promise<{
    id: string;
    name: string;
    domainId: string;
    emailAddress?: string;
    credentials?: Record<string, StalwartCredentialRecord>;
    encryptionAtRest?: Record<string, unknown>;
  } | null> {
    const normalizedLocalPart = input.localPart.trim().toLowerCase();
    const queryEnvelope = await this.postJmap([
      [
        "x:Account/query",
        {
          filter: {
            name: normalizedLocalPart,
            domainId: input.domainId,
          },
        },
        "c1",
      ],
    ]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:Account/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    if (ids.length === 0) {
      return null;
    }

    const accountId = ids[0];
    if (!accountId) {
      return null;
    }

    const account = await this.getAccount(accountId);
    if (account.name.trim().toLowerCase() !== normalizedLocalPart) {
      return null;
    }

    if (account.domainId !== input.domainId) {
      return null;
    }

    return account;
  }

  private async findAccountByEmailAddress(input: {
    email: string;
    domainId: string;
  }): Promise<{
    id: string;
    name: string;
    domainId: string;
    emailAddress?: string;
    credentials?: Record<string, StalwartCredentialRecord>;
    encryptionAtRest?: Record<string, unknown>;
  } | null> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const queryEnvelope = await this.postJmap([
      [
        "x:Account/query",
        {
          filter: {
            domainId: input.domainId,
          },
        },
        "c1",
      ],
    ]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:Account/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    if (ids.length === 0) {
      return null;
    }

    const getEnvelope = await this.postJmap([
      [
        "x:Account/get",
        {
          ids,
        },
        "c1",
      ],
    ]);
    const getResult = this.getMethodResult<{
      list?: Array<{
        id: string;
        name: string;
        domainId: string;
        emailAddress?: string;
        credentials?: Record<string, StalwartCredentialRecord>;
        encryptionAtRest?: Record<string, unknown>;
      }>;
    }>(getEnvelope, "x:Account/get");

    return (
      (getResult.list ?? []).find(
        (account) =>
          account.emailAddress?.trim().toLowerCase() === normalizedEmail,
      ) ?? null
    );
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
    const propertyTargets = Array.isArray(error.properties)
      ? error.properties
      : [];
    const isEmailPrimaryKeyViolation =
      error.type === "primaryKeyViolation" && propertyTargets.includes("email");

    if (!isEmailPrimaryKeyViolation || !objectId) {
      return null;
    }

    logger.warn(
      "Stalwart createAccount reported an existing remote mailbox; attempting recovery",
      {
        requestedLocalPart: input.localPart,
        requestedDomainId: input.domainId,
        existingAccountId: objectId,
        errorType: error.type,
        properties: propertyTargets,
      },
    );

    return objectId;
  }

  private async getAccountIfExists(accountId: string): Promise<{
    id: string;
    name: string;
    domainId: string;
    emailAddress?: string;
    credentials?: Record<string, StalwartCredentialRecord>;
    encryptionAtRest?: Record<string, unknown>;
  } | null> {
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
        credentials?: Record<string, StalwartCredentialRecord>;
        encryptionAtRest?: Record<string, unknown>;
      }>;
    }>(envelope, "x:Account/get");

    return result.list?.[0] ?? null;
  }

  private async getAccount(accountId: string): Promise<{
    id: string;
    name: string;
    domainId: string;
    emailAddress?: string;
    credentials?: Record<string, StalwartCredentialRecord>;
    encryptionAtRest?: Record<string, unknown>;
  }> {
    const account = await this.getAccountIfExists(accountId);
    if (!account) {
      throw new Error(
        `Stalwart account lookup failed after account creation for id '${accountId}'.`,
      );
    }

    return account;
  }

  async setAccountPassword(input: {
    accountId: string;
    secret: string;
  }): Promise<void> {
    const account = await this.getAccount(input.accountId);
    await this.updateAccountPasswordCredential({
      accountId: input.accountId,
      existingCredentials: account.credentials,
      secret: input.secret,
    });
  }

  async resolveAccountIdByMailbox(input: {
    localPart: string;
    domainId: string;
  }): Promise<string | null> {
    const account = await this.findAccountByMailbox(input);
    return account?.id ?? null;
  }

  async resolveMailboxPublicKey(input: {
    email: string;
  }): Promise<{
    email: string;
    publicKeyArmored: string;
    publicKeyId: string;
    stalwartAccountId: string;
    stalwartDomainId: string;
  } | null> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const atIndex = normalizedEmail.lastIndexOf("@");
    if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
      return null;
    }

    const localPart = normalizedEmail.slice(0, atIndex);
    const domainName = normalizedEmail.slice(atIndex + 1);

    let domain: StalwartDomainRecord;
    try {
      domain = await this.resolveDomainByName(domainName);
    } catch {
      return null;
    }

    const accountByName = await this.findAccountByMailbox({
      localPart,
      domainId: domain.id,
    });
    const account =
      accountByName ??
      (await this.findAccountByEmailAddress({
        email: normalizedEmail,
        domainId: domain.id,
      }));
    const accountId = account?.id;
    if (!accountId) {
      return null;
    }

    const publicKeys = await this.listPublicKeysForAccount(accountId);
    const matchingKey =
      publicKeys.find((publicKey) =>
        this.publicKeyMatchesEmail(publicKey, normalizedEmail),
      ) ?? publicKeys[0];
    const publicKeyArmored = matchingKey?.key?.trim();

    if (!matchingKey?.id || !publicKeyArmored) {
      return null;
    }

    return {
      email: normalizedEmail,
      publicKeyArmored,
      publicKeyId: matchingKey.id,
      stalwartAccountId: accountId,
      stalwartDomainId: domain.id,
    };
  }

  async deleteAccount(accountId: string): Promise<void> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error("Stalwart account deletion requires a non-empty account id.");
    }

    const envelope = await this.postJmap([
      [
        "x:Account/set",
        {
          destroy: [normalizedAccountId],
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      destroyed?: string[];
      notDestroyed?: Record<string, StalwartSetError>;
    }>(envelope, "x:Account/set");
    const destroyError = result.notDestroyed?.[normalizedAccountId];

    if (destroyError) {
      throw new Error(
        destroyError.description || "Stalwart account deletion failed.",
      );
    }

    if ((result.destroyed ?? []).includes(normalizedAccountId)) {
      logger.info("Deleted Stalwart account", {
        accountId: normalizedAccountId,
      });
      return;
    }

    const stillExists = await this.getAccountIfExists(normalizedAccountId);
    if (!stillExists) {
      logger.info("Stalwart account already absent before deletion", {
        accountId: normalizedAccountId,
      });
      return;
    }

    throw new Error("Stalwart account deletion was not acknowledged.");
  }

  private async updateAccountPasswordCredential(input: {
    accountId: string;
    existingCredentials?: Record<string, StalwartCredentialRecord>;
    secret: string;
  }): Promise<void> {
    const existingCredentials = Object.entries(input.existingCredentials ?? {});
    const passwordEntry = existingCredentials.find(
      ([, credential]) => credential?.["@type"] === "Password",
    );
    const passwordCredentialKey = passwordEntry?.[0] ?? "0";
    const passwordCredential = toWritableCredential(
      (passwordEntry?.[1] ?? {}) as StalwartCredentialRecord,
    );

    const envelope = await this.postJmap([
      [
        "x:Account/set",
        {
          update: {
            [input.accountId]: {
              [`credentials/${passwordCredentialKey}`]: {
                ...passwordCredential,
                "@type": "Password",
                secret: input.secret,
                expiresAt: null,
                allowedIps:
                  typeof passwordCredential.allowedIps === "object" &&
                  passwordCredential.allowedIps !== null
                    ? passwordCredential.allowedIps
                    : {},
              },
            },
          },
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      updated?: Record<string, null>;
      notUpdated?: Record<string, StalwartSetError>;
    }>(envelope, "x:Account/set");
    const updateError = result.notUpdated?.[input.accountId];
    if (updateError) {
      throw new Error(
        updateError.description || "Stalwart account password update failed.",
      );
    }
    if (!(input.accountId in (result.updated ?? {}))) {
      throw new Error("Stalwart account password update was not acknowledged.");
    }
  }

  async ensureOAuthClient(input: {
    clientId: string;
    redirectUri: string;
    description?: string | null;
  }): Promise<void> {
    const queryEnvelope = await this.postJmap([["x:OAuthClient/query", {}, "c1"]]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:OAuthClient/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    if (ids.length > 0) {
      const getEnvelope = await this.postJmap([
        ["x:OAuthClient/get", { ids }, "c1"],
      ]);
      const getResult = this.getMethodResult<{
        list?: Array<{
          id: string;
          clientId: string;
          description?: string | null;
          redirectUris?: string[];
        }>;
      }>(getEnvelope, "x:OAuthClient/get");
      const existing = (getResult.list ?? []).find(
        (entry) => entry.clientId === input.clientId,
      );

      if (existing) {
        const redirectUris = Array.isArray(existing.redirectUris)
          ? existing.redirectUris
          : [];
        const needsUpdate =
          !redirectUris.includes(input.redirectUri) ||
          (input.description ?? null) !== (existing.description ?? null);

        if (!needsUpdate) {
          return;
        }

        const nextRedirectUris = [...new Set([...redirectUris, input.redirectUri])];
        const envelope = await this.postJmap([
          [
            "x:OAuthClient/set",
            {
              update: {
                [existing.id]: {
                  redirectUris: nextRedirectUris,
                  description: input.description ?? null,
                },
              },
            },
            "c1",
          ],
        ]);
        this.getMethodResult(envelope, "x:OAuthClient/set");
        return;
      }
    }

    const envelope = await this.postJmap([
      [
        "x:OAuthClient/set",
        {
          create: {
            client1: {
              clientId: input.clientId,
              redirectUris: [input.redirectUri],
              description: input.description ?? null,
            },
          },
        },
        "c1",
      ],
    ]);
    this.getMethodResult(envelope, "x:OAuthClient/set");
  }

  async issueOAuthAccessToken(input: {
    accountName: string;
    accountSecret: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    codeChallenge: string;
  }): Promise<{
    access_token: string;
    expires_in?: number;
    expires_at?: number;
    refresh_token?: string;
  }> {
    const authResponse = await this.fetcher(`${this.baseUrl}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "authCode",
        accountName: input.accountName,
        accountSecret: input.accountSecret,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: "S256",
      }),
    });

    type AuthCodeResponse =
      | {
          type: "authenticated";
          clientCode?: string;
          client_code?: string;
        }
      | { type: "failure" }
      | { type: "mfaRequired" }
      | Record<string, unknown>;

    const authPayload = (await authResponse
      .json()
      .catch(() => null)) as AuthCodeResponse | null;

    if (!authResponse.ok || !authPayload) {
      throw new Error(
        `Stalwart mailbox login failed with status ${authResponse.status}.`,
      );
    }

    const clientCode =
      authPayload.type === "authenticated"
        ? typeof authPayload.clientCode === "string"
          ? authPayload.clientCode
          : typeof authPayload.client_code === "string"
            ? authPayload.client_code
            : null
        : null;

    if (!clientCode) {
      throw new Error("Stalwart mailbox login was rejected.");
    }

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code: clientCode,
      code_verifier: input.codeVerifier,
    });
    const tokenResponse = await this.fetcher(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });

    const tokenPayload = (await tokenResponse
      .json()
      .catch(() => null)) as
      | {
          access_token?: string;
          expires_in?: number;
          expires_at?: number;
          refresh_token?: string;
          error?: string;
        }
      | null;

    if (!tokenResponse.ok || !tokenPayload?.access_token) {
      throw new Error(
        tokenPayload?.error || "Stalwart mailbox token exchange failed.",
      );
    }

    return {
      access_token: tokenPayload.access_token,
      expires_in: tokenPayload.expires_in,
      expires_at: tokenPayload.expires_at,
      refresh_token: tokenPayload.refresh_token,
    };
  }

  async registerPublicKey(input: {
    accountId: string;
    email: string;
    publicKeyArmored: string;
    description?: string | null;
  }): Promise<{ publicKeyId: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();
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
                [normalizedEmail]: true,
              },
            },
          },
        },
        "c1",
      ],
    ]);

    const result = this.getMethodResult<{
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, StalwartSetError>;
    }>(envelope, "x:PublicKey/set");
    const created = result.created?.pk1;

    if (created?.id) {
      return {
        publicKeyId: created.id,
      };
    }

    const recoveredPublicKeyId = await this.recoverExistingPublicKeyId({
      accountId: input.accountId,
      email: normalizedEmail,
      publicKeyArmored: input.publicKeyArmored,
      description: input.description ?? null,
      createError: result.notCreated?.pk1,
    });

    if (recoveredPublicKeyId) {
      return {
        publicKeyId: recoveredPublicKeyId,
      };
    }

    const reason = result.notCreated?.pk1?.description || "Unknown error";
    throw new Error(`Stalwart public-key registration failed: ${reason}`);
  }

  private publicKeyMatchesEmail(
    publicKey: {
      emailAddresses?: Record<string, boolean> | string[];
    },
    email: string,
  ): boolean {
    const emailAddresses = publicKey.emailAddresses;
    if (!emailAddresses) {
      return false;
    }

    if (Array.isArray(emailAddresses)) {
      return emailAddresses.some(
        (address) => address.trim().toLowerCase() === email,
      );
    }

    return emailAddresses[email] === true;
  }

  private async listPublicKeysForAccount(accountId: string): Promise<
    Array<{
      id: string;
      key?: string;
      emailAddresses?: Record<string, boolean> | string[];
    }>
  > {
    const queryEnvelope = await this.postJmap([
      [
        "x:PublicKey/query",
        {
          filter: {
            accountId,
          },
        },
        "c1",
      ],
    ]);
    const queryResult = this.getMethodResult<{ ids?: string[] }>(
      queryEnvelope,
      "x:PublicKey/query",
    );
    const ids = Array.isArray(queryResult.ids) ? queryResult.ids : [];

    if (ids.length === 0) {
      return [];
    }

    const getEnvelope = await this.postJmap([
      [
        "x:PublicKey/get",
        {
          ids,
        },
        "c1",
      ],
    ]);
    const getResult = this.getMethodResult<{
      list?: Array<{
        id: string;
        key?: string;
        emailAddresses?: Record<string, boolean> | string[];
      }>;
    }>(getEnvelope, "x:PublicKey/get");

    return getResult.list ?? [];
  }

  private async recoverExistingPublicKeyId(input: {
    accountId: string;
    email: string;
    publicKeyArmored: string;
    description: string | null;
    createError?: StalwartSetError;
  }): Promise<string | null> {
    const existingKeys = await this.listPublicKeysForAccount(input.accountId);
    let matchingKey = existingKeys.find((publicKey) =>
      this.publicKeyMatchesEmail(publicKey, input.email),
    );

    if (!matchingKey?.id && existingKeys.length > 0) {
      const fallbackKey = existingKeys[0];
      if (fallbackKey?.id) {
        matchingKey = fallbackKey;
        logger.warn(
          "Adopting the first Stalwart public key for mailbox recovery",
          {
            accountId: input.accountId,
            recipientRef: logRef(input.email),
            existingPublicKeyId: fallbackKey.id,
          },
        );
      }
    }

    if (!matchingKey?.id) {
      return null;
    }

    logger.warn(
      "Stalwart registerPublicKey reported an existing remote key; attempting recovery",
      {
        accountId: input.accountId,
        recipientRef: logRef(input.email),
        existingPublicKeyId: matchingKey.id,
        errorType: input.createError?.type ?? null,
        properties: input.createError?.properties ?? null,
      },
    );

    const envelope = await this.postJmap([
      [
        "x:PublicKey/set",
        {
          accountId: input.accountId,
          update: {
            [matchingKey.id]: {
              description: input.description,
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
      updated?: Record<string, null>;
      notUpdated?: Record<string, StalwartSetError>;
    }>(envelope, "x:PublicKey/set");
    const updateError = result.notUpdated?.[matchingKey.id];

    if (updateError) {
      throw new Error(
        updateError.description ||
          "Stalwart public-key update failed during recovery.",
      );
    }

    if (!(matchingKey.id in (result.updated ?? {}))) {
      throw new Error(
        "Stalwart public-key update was not acknowledged during recovery.",
      );
    }

    return matchingKey.id;
  }

  async enableEncryptionAtRest(input: {
    accountId: string;
    publicKeyId: string;
    encryptOnAppend?: boolean;
    allowSpamTraining?: boolean;
  }): Promise<void> {
    const account = await this.getAccount(input.accountId);
    const encryptionAtRest = account.encryptionAtRest;
    const encryptionType =
      typeof encryptionAtRest?.["@type"] === "string"
        ? encryptionAtRest["@type"]
        : null;
    const configuredPublicKeyId =
      typeof encryptionAtRest?.publicKey === "string"
        ? encryptionAtRest.publicKey
        : null;

    if (
      encryptionType === "Aes256" &&
      configuredPublicKeyId === input.publicKeyId
    ) {
      return;
    }

    const envelope = await this.postJmap([
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

    const result = this.getMethodResult<{
      updated?: Record<string, null>;
      notUpdated?: Record<string, StalwartSetError>;
    }>(envelope, "x:AccountSettings/set");
    const updateError = result.notUpdated?.singleton;

    if (updateError) {
      throw new Error(
        updateError.description || "Stalwart encryption-at-rest update failed.",
      );
    }

    if (!(result.updated && "singleton" in result.updated)) {
      throw new Error(
        "Stalwart encryption-at-rest update was not acknowledged.",
      );
    }
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
