import { createLogger } from "@workspace/logger";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import {
  ConflictError,
  NotFoundError,
  UpstreamServiceError,
  ValidationError, errorString} from "../lib/errors";
import {
  errorLogDetails,
  logRef,
  sanitizeLogContext,
} from "../lib/log-sanitization";
import { getOpenPgpPublicKeyFingerprint } from "../lib/mail-key-utils";
import type {
  GetMailAccountStatusInput,
  MailAccessTokenForUserInput,
  MailAccessTokenResult,
  GetMailVaultBackupForUserInput,
  IMailService,
  MailAccountStatusResult,
  MailBootstrapForUserInput,
  DeleteMailboxForUserInput,
  MailDemoConfig,
  MailDirectoryKeyResult,
  MailOAuthConfig,
  MailSignupResult,
  MailVaultKdfParams,
  MailVaultBackupResult,
  UpsertMailVaultBackupInput,
  UpsertMailVaultBackupForUserInput,
} from "../contracts/mail.contract";
import type {
  StalwartAdminClientLike,
  StalwartJmapAdminClientLike,
} from "../lib/stalwart-admin";
import { fetchStalwartMailServerLimits } from "../lib/stalwart-mail-limits";
import {
  createMailBridgePkcePair,
  deriveMailBridgeSecret,
} from "../lib/mail-bridge-auth";
import { normalizeEmail, normalizeEmailOrThrow } from "../lib/email-utils";

const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MIN_VAULT_MEMORY_KIB = 8192;
const MAIL_TOKEN_EXPIRY_SKEW_MS = 60_000;
const SERVER_LIMITS_CACHE_TTL_MS = 60_000;
const logger = createLogger("backend:mail-service");

const linkedMailboxSelect = {
  id: true,
  email: true,
  displayName: true,
  stalwartAccountId: true,
  stalwartPublicKeyId: true,
  publicKeyFingerprint: true,
  userId: true,
} as const;

type NormalizedProvisioningInput = {
  displayName: string | null;
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
  createdAt: Date;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

type LinkedMailboxRecord = {
  id: string;
  email: string;
  displayName: string | null;
  stalwartAccountId: string;
  stalwartPublicKeyId: string | null;
  publicKeyFingerprint: string;
  userId: string | null;
};

type DirectoryEntryOwnershipRecord = {
  id: string;
  email: string;
  userId: string | null;
};

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  return normalized.length > 0 ? normalized : null;
}

function parseMailboxEmail(value: string): {
  email: string;
  localPart: string;
  domain: string;
} {
  const email = normalizeEmailOrThrow(value);
  const separatorIndex = email.lastIndexOf("@");
  const localPart = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);

  if (!LOCAL_PART_PATTERN.test(localPart)) {
    throw new ValidationError(
      "Mailbox local parts may only contain lowercase letters, numbers, dots, underscores, and hyphens.",
      "email",
    );
  }

  return {
    email,
    localPart,
    domain,
  };
}

function normalizeFingerprint(value: string): string {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

function generateMailboxCredentialSecret(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

function assertVaultParams(
  kdf: string,
  params: {
    saltB64: string;
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  },
): void {
  if (kdf.trim().toLowerCase() !== "argon2id") {
    throw new ValidationError("Mail vault backups must use Argon2id.", "kdf");
  }

  if (!params.saltB64.trim()) {
    throw new ValidationError("Vault salt is required.", "kdfParams.saltB64");
  }

  if (params.memoryKiB < MIN_VAULT_MEMORY_KIB) {
    throw new ValidationError(
      `Vault memory cost must be at least ${MIN_VAULT_MEMORY_KIB} KiB.`,
      "kdfParams.memoryKiB",
    );
  }

  if (params.iterations < 1) {
    throw new ValidationError(
      "Vault iterations must be at least 1.",
      "kdfParams.iterations",
    );
  }

  if (params.parallelism < 1) {
    throw new ValidationError(
      "Vault parallelism must be at least 1.",
      "kdfParams.parallelism",
    );
  }
}

function normalizeProvisioningInput(input: {
  displayName?: string | null;
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
  createdAt: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
}): NormalizedProvisioningInput {
  const displayName = normalizeOptionalText(input.displayName);
  const publicKeyArmored = input.publicKeyArmored.trim();
  const fingerprint = normalizeFingerprint(input.fingerprint);
  const algorithm = input.algorithm.trim().toLowerCase();
  const createdAt = new Date(input.createdAt);
  const encryptedVaultB64 = input.encryptedVaultB64.trim();

  if (!publicKeyArmored) {
    throw new ValidationError("A public key is required.", "publicKeyArmored");
  }

  if (algorithm !== "openpgp") {
    throw new ValidationError(
      "Only OpenPGP mailbox keys are supported by this demo.",
      "algorithm",
    );
  }

  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError(
      "Key creation time must be a valid ISO date.",
      "createdAt",
    );
  }

  if (!encryptedVaultB64) {
    throw new ValidationError(
      "An encrypted vault backup is required.",
      "encryptedVaultB64",
    );
  }

  assertVaultParams(input.kdf, input.kdfParams);

  return {
    displayName,
    publicKeyArmored,
    fingerprint,
    algorithm,
    createdAt,
    vaultVersion: input.vaultVersion,
    encryptedVaultB64,
    kdf: input.kdf.trim().toLowerCase(),
    kdfParams: {
      saltB64: input.kdfParams.saltB64.trim(),
      memoryKiB: input.kdfParams.memoryKiB,
      iterations: input.kdfParams.iterations,
      parallelism: input.kdfParams.parallelism,
    },
  };
}

function normalizeMailProvisioningError(error: unknown): never {
  if (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof UpstreamServiceError
  ) {
    throw error;
  }

  const message = error instanceof Error ? error.message.trim() : "";

  if (!message) {
    throw new UpstreamServiceError(
      "Mailbox provisioning failed for an unknown reason.",
    );
  }

  if (/already exists|already in use|duplicate/i.test(message)) {
    throw new ConflictError("That mailbox already exists on the mail server.");
  }

  if (/domain .*not found|domain .*was not found/i.test(message)) {
    throw new UpstreamServiceError(
      "The configured mail domain was not found on the mail server.",
    );
  }

  if (
    /account creation failed|public-key registration failed|admin session|admin jmap request failed|encryption/i.test(
      message,
    )
  ) {
    throw new UpstreamServiceError(message);
  }

  throw new UpstreamServiceError(`Mailbox provisioning failed: ${message}`);
}

function getUniqueConstraintTargets(error: unknown): string[] {
  if (!error || typeof error !== "object" || !("meta" in error)) {
    return [];
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.map((value) => String(value));
  }

  if (typeof target === "string") {
    return [target];
  }

  return [];
}

function isUniqueConstraintError(error: unknown, fields?: string[]): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code !== "P2002") {
    return false;
  }

  if (!fields || fields.length === 0) {
    return true;
  }

  const targets = getUniqueConstraintTargets(error);
  return fields.some((field) => targets.includes(field));
}

function normalizeMailPersistenceError(error: unknown): never {
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof UpstreamServiceError
  ) {
    throw error;
  }

  if (isUniqueConstraintError(error, ["email"])) {
    throw new ConflictError("That mailbox already exists.");
  }

  if (isUniqueConstraintError(error, ["user_id", "userId"])) {
    throw new ValidationError(
      "A mailbox has already been provisioned for this account.",
      "email",
    );
  }

  if (
    isUniqueConstraintError(error, ["stalwart_account_id", "stalwartAccountId"])
  ) {
    throw new ConflictError(
      "That mailbox is already linked to an existing mail account.",
    );
  }

  const message = errorString(error);
  throw new UpstreamServiceError(
    `Mailbox directory persistence failed: ${message}`,
    500,
  );
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export class MailService implements IMailService {
  private readonly accessTokenCache = new Map<
    string,
    { token: MailAccessTokenResult; expiresAtMs: number }
  >();
  private readonly accessTokenInflight = new Map<
    string,
    Promise<MailAccessTokenResult>
  >();
  private readonly bridgePasswordConfiguredAccountIds = new Set<string>();

  private serverLimitsCache: {
    expiresAt: number;
    value: MailDemoConfig["serverLimits"];
  } | null = null;
  private serverLimitsInflight: Promise<MailDemoConfig["serverLimits"]> | null =
    null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly adminClient: StalwartAdminClientLike,
    private readonly config: {
      defaultDomain: string;
      discoveryBaseUrl: string;
      oauth: MailOAuthConfig;
      vaultKeyMaterialEndpoint: string;
      stalwartOauthClientId: string;
      stalwartOauthRedirectUri: string;
    },
  ) {}

  getConfig(): Promise<MailDemoConfig> {
    return this.getConfigWithServerLimits();
  }

  private getBaseConfig(): MailDemoConfig {
    return {
      defaultDomain: this.config.defaultDomain,
      discoveryBaseUrl: this.config.discoveryBaseUrl,
      signupEnabled: true,
      oauth: this.config.oauth,
      vaultKeyMaterialEndpoint: this.config.vaultKeyMaterialEndpoint,
    };
  }

  async getConfigWithServerLimits(): Promise<MailDemoConfig> {
    const serverLimits = await this.loadServerLimits();
    return {
      ...this.getBaseConfig(),
      serverLimits,
    };
  }

  private loadServerLimits(): Promise<MailDemoConfig["serverLimits"]> {
    const now = Date.now();
    if (
      this.serverLimitsCache &&
      this.serverLimitsCache.expiresAt > now
    ) {
      return Promise.resolve(this.serverLimitsCache.value);
    }

    if (this.serverLimitsInflight) {
      return this.serverLimitsInflight;
    }

    const inflight = this.fetchServerLimits()
      .then(({ value, cacheable }) => {
        if (cacheable) {
          this.serverLimitsCache = {
            expiresAt: Date.now() + SERVER_LIMITS_CACHE_TTL_MS,
            value,
          };
        } else {
          this.serverLimitsCache = null;
        }

        return value;
      })
      .finally(() => {
        if (this.serverLimitsInflight === inflight) {
          this.serverLimitsInflight = null;
        }
      });

    this.serverLimitsInflight = inflight;
    return inflight;
  }

  private async fetchServerLimits(): Promise<{
    value: MailDemoConfig["serverLimits"];
    cacheable: boolean;
  }> {
    if (!isJmapAdminClient(this.adminClient)) {
      return { value: null, cacheable: true };
    }

    try {
      const limits = await fetchStalwartMailServerLimits(this.adminClient);
      const hasValues =
        hasValue(limits.maxBlobUploadBytes) ||
        hasValue(limits.maxAttachmentSizeBytes) ||
        hasValue(limits.maxMessageSizeBytes) ||
        hasValue(limits.maxMailboxDepth) ||
        hasValue(limits.maxMailboxNameLength) ||
        hasValue(limits.maxMailboxes) ||
        hasValue(limits.maxIdentities) ||
        hasValue(limits.defaultFolders) ||
        hasValue(limits.getMaxResults) ||
        hasValue(limits.queryMaxResults) ||
        hasValue(limits.maxMethodCalls) ||
        hasValue(limits.maxConcurrentUploads) ||
        hasValue(limits.maxRequestSizeBytes) ||
        hasValue(limits.uploadTtlMs);
      return { value: hasValues ? limits : null, cacheable: true };
    } catch (error) {
      logger.warn("Failed to load Stalwart mail server limits", {
        ...errorLogDetails(error),
      });
      return { value: null, cacheable: false };
    }
  }

  async issueAccessTokenForUser(
    input: MailAccessTokenForUserInput,
  ): Promise<MailAccessTokenResult> {
    const normalizedEmail = normalizeEmailOrThrow(input.email);
    const mailbox = await this.findOrAttachMailboxForUser({
      userId: input.userId,
      email: normalizedEmail,
    });

    if (!mailbox?.stalwartAccountId) {
      throw new ValidationError(
        "This Solace account does not have a provisioned mailbox yet.",
        "email",
      );
    }

    const bridgeSecret = await deriveMailBridgeSecret({
      userId: input.userId,
      email: mailbox.email,
    });
    const { codeVerifier, codeChallenge } = await createMailBridgePkcePair();

    await this.adminClient.ensureOAuthClient({
      clientId: this.config.stalwartOauthClientId,
      redirectUri: this.config.stalwartOauthRedirectUri,
      description: "Solace mail backend bridge",
    });
    await this.ensureBridgeAccountPassword({
      accountId: mailbox.stalwartAccountId,
      secret: bridgeSecret,
    });

    const token = await this.adminClient.issueOAuthAccessToken({
      accountName: mailbox.email,
      accountSecret: bridgeSecret,
      clientId: this.config.stalwartOauthClientId,
      redirectUri: this.config.stalwartOauthRedirectUri,
      codeVerifier,
      codeChallenge,
    });

    const expiresIn = token.expires_in ?? 3600;
    return {
      access_token: token.access_token,
      expires_in: expiresIn,
      expires_at:
        token.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn,
    };
  }

  async getAccessTokenForUser(
    input: MailAccessTokenForUserInput,
  ): Promise<MailAccessTokenResult> {
    const cacheKey = input.userId;
    const cached = this.accessTokenCache.get(cacheKey);
    if (
      cached &&
      Date.now() + MAIL_TOKEN_EXPIRY_SKEW_MS < cached.expiresAtMs
    ) {
      return cached.token;
    }

    const inflight = this.accessTokenInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = this.issueAccessTokenForUser(input)
      .then((token) => {
        this.accessTokenCache.set(cacheKey, {
          token,
          expiresAtMs: token.expires_at * 1000,
        });
        logger.debug("Cached mail access token for user", {
          userId: input.userId,
          expiresAt: token.expires_at,
        });
        return token;
      })
      .finally(() => {
        this.accessTokenInflight.delete(cacheKey);
      });

    this.accessTokenInflight.set(cacheKey, promise);
    return promise;
  }

  invalidateAccessTokenForUser(userId: string): void {
    this.accessTokenCache.delete(userId);
    this.accessTokenInflight.delete(userId);
  }

  private async ensureBridgeAccountPassword(input: {
    accountId: string;
    secret: string;
  }): Promise<void> {
    if (this.bridgePasswordConfiguredAccountIds.has(input.accountId)) {
      return;
    }

    await this.adminClient.setAccountPassword({
      accountId: input.accountId,
      secret: input.secret,
    });
    this.bridgePasswordConfiguredAccountIds.add(input.accountId);
    logger.debug("Configured Stalwart bridge password for account", {
      accountId: input.accountId,
    });
  }

  private async reconcileProvisionedMailboxRecord(
    tx: Prisma.TransactionClient,
    input: {
      userId?: string | null;
      email: string;
      localPart: string;
      domain: string;
      provisioning: NormalizedProvisioningInput;
    },
    details: {
      stalwartAccountId: string;
      stalwartDomainId: string;
      stalwartPublicKeyId: string;
      derivedFingerprint: string;
    },
    existingEntry: DirectoryEntryOwnershipRecord,
  ): Promise<void> {
    const requiresEmailRepair = existingEntry.email !== input.email;
    const isOwnedByDifferentUser = Boolean(
      existingEntry.userId && existingEntry.userId !== input.userId,
    );

    if (isOwnedByDifferentUser) {
      logger.warn(
        "Provisioned Stalwart account is already linked to another Solace account",
        sanitizeLogContext({
          email: input.email,
          userId: input.userId ?? null,
          existingUserId: existingEntry.userId,
          stalwartAccountId: details.stalwartAccountId,
          directoryEntryId: existingEntry.id,
        }),
      );
      throw new ValidationError(
        "That mailbox is already linked to another Solace account.",
        "email",
      );
    }

    if (requiresEmailRepair) {
      logger.warn(
        "Repairing stale mail directory entry for a provisioned Stalwart account",
        sanitizeLogContext({
          requestedEmail: input.email,
          existingEmail: existingEntry.email,
          userId: input.userId ?? null,
          existingUserId: existingEntry.userId,
          stalwartAccountId: details.stalwartAccountId,
          directoryEntryId: existingEntry.id,
          resetMailSyncState: true,
        }),
      );

      await tx.mailJmapSyncState.deleteMany({
        where: {
          directoryEntryId: existingEntry.id,
        },
      });
    }

    if (!requiresEmailRepair) {
      logger.warn(
        "Reusing existing mail directory entry for provisioned Stalwart account",
        sanitizeLogContext({
          email: input.email,
          userId: input.userId ?? null,
          existingUserId: existingEntry.userId,
          stalwartAccountId: details.stalwartAccountId,
          directoryEntryId: existingEntry.id,
        }),
      );
    }

    await tx.mailDirectoryEntry.update({
      where: { id: existingEntry.id },
      data: {
        email: input.email,
        localPart: input.localPart,
        domain: input.domain,
        displayName: input.provisioning.displayName,
        stalwartDomainId: details.stalwartDomainId,
        stalwartPublicKeyId: details.stalwartPublicKeyId,
        publicKeyArmored: input.provisioning.publicKeyArmored,
        publicKeyFingerprint: details.derivedFingerprint,
        keyAlgorithm: input.provisioning.algorithm,
        source: "internal",
        trust: "verified",
        keyCreatedAt: input.provisioning.createdAt,
        ...(input.userId && !existingEntry.userId
          ? {
              user: {
                connect: {
                  id: input.userId,
                },
              },
            }
          : {}),
        vaultBackup: {
          upsert: {
            create: {
              vaultVersion: input.provisioning.vaultVersion,
              encryptedVaultB64: input.provisioning.encryptedVaultB64,
              kdf: input.provisioning.kdf,
              kdfSaltB64: input.provisioning.kdfParams.saltB64,
              kdfMemoryKiB: input.provisioning.kdfParams.memoryKiB,
              kdfIterations: input.provisioning.kdfParams.iterations,
              kdfParallelism: input.provisioning.kdfParams.parallelism,
            },
            update: {
              vaultVersion: input.provisioning.vaultVersion,
              encryptedVaultB64: input.provisioning.encryptedVaultB64,
              kdf: input.provisioning.kdf,
              kdfSaltB64: input.provisioning.kdfParams.saltB64,
              kdfMemoryKiB: input.provisioning.kdfParams.memoryKiB,
              kdfIterations: input.provisioning.kdfParams.iterations,
              kdfParallelism: input.provisioning.kdfParams.parallelism,
            },
          },
        },
      },
    });
  }

  private async findOrAttachMailboxForUser(input: {
    userId: string;
    email: string;
  }): Promise<LinkedMailboxRecord | null> {
    const entryByUserId = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId: input.userId },
      select: linkedMailboxSelect,
    });

    if (entryByUserId) {
      return entryByUserId;
    }

    const entryByEmail = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: input.email },
      select: linkedMailboxSelect,
    });

    if (!entryByEmail) {
      return null;
    }

    if (entryByEmail.userId && entryByEmail.userId !== input.userId) {
      throw new ValidationError(
        "That mailbox is already linked to another Solace account.",
        "email",
      );
    }

    if (entryByEmail.userId === input.userId) {
      return entryByEmail;
    }

    return this.prisma.mailDirectoryEntry.update({
      where: { id: entryByEmail.id },
      data: {
        user: {
          connect: {
            id: input.userId,
          },
        },
      },
      select: linkedMailboxSelect,
    });
  }

  private async deleteOrphanedStalwartAccountIfNeeded(
    accountId: string,
    options?: { onlyIfCreated?: boolean; wasCreated?: boolean },
  ): Promise<void> {
    if (!accountId) {
      return;
    }

    if (options?.onlyIfCreated && !options.wasCreated) {
      return;
    }

    const existingEntry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { stalwartAccountId: accountId },
      select: { id: true },
    });

    if (existingEntry) {
      return;
    }

    try {
      await this.adminClient.deleteAccount(accountId);
      logger.warn(
        "Deleted orphaned Stalwart account after failed mailbox provisioning",
        {
          stalwartAccountId: accountId,
        },
      );
    } catch (error) {
      logger.error(
        "Failed to delete orphaned Stalwart account after failed mailbox provisioning",
        {
          stalwartAccountId: accountId,
          ...errorLogDetails(error),
        },
      );
    }
  }

  private async purgeLinkedStalwartMailbox(input: {
    stalwartAccountId: string;
    localPart: string;
    stalwartDomainId: string;
    email: string;
  }): Promise<void> {
    const attemptedIds = new Set<string>();

    const destroyAccount = async (accountId: string) => {
      const normalizedAccountId = accountId.trim();
      if (!normalizedAccountId || attemptedIds.has(normalizedAccountId)) {
        return;
      }

      attemptedIds.add(normalizedAccountId);
      await this.adminClient.deleteAccount(normalizedAccountId);
    };

    try {
      await destroyAccount(input.stalwartAccountId);

      const remoteAccountId = await this.adminClient.resolveAccountIdByMailbox({
        localPart: input.localPart,
        domainId: input.stalwartDomainId,
      });

      if (remoteAccountId) {
        await destroyAccount(remoteAccountId);
      }
    } catch (error) {
      logger.error("Failed to delete linked Stalwart account during Solace account deletion", {
        recipientRef: logRef(input.email),
        stalwartAccountId: input.stalwartAccountId,
        ...errorLogDetails(error),
      });
      throw new UpstreamServiceError(
        "Could not delete the linked Stalwart mailbox. Try again in a moment.",
      );
    }
  }

  async deleteMailboxForUser(input: DeleteMailboxForUserInput): Promise<void> {
    const mailbox = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId: input.userId },
      select: {
        id: true,
        email: true,
        localPart: true,
        stalwartAccountId: true,
        stalwartDomainId: true,
      },
    });

    if (!mailbox) {
      return;
    }

    await this.purgeLinkedStalwartMailbox({
      stalwartAccountId: mailbox.stalwartAccountId,
      localPart: mailbox.localPart,
      stalwartDomainId: mailbox.stalwartDomainId,
      email: mailbox.email,
    });

    await this.prisma.mailDirectoryEntry.delete({
      where: { id: mailbox.id },
    });

    logger.info("Deleted linked mailbox for Solace account", {
      userId: input.userId,
      recipientRef: logRef(mailbox.email),
      stalwartAccountId: mailbox.stalwartAccountId,
    });
  }

  private async createMailbox(input: {
    userId: string;
    email: string;
    localPart: string;
    domain: string;
    provisioning: NormalizedProvisioningInput;
  }): Promise<MailSignupResult> {
    const existingEntry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingEntry) {
      throw new ValidationError("That mailbox already exists.", "email");
    }

    let derivedFingerprint: string;
    try {
      derivedFingerprint = normalizeFingerprint(
        await getOpenPgpPublicKeyFingerprint(
          input.provisioning.publicKeyArmored,
        ),
      );
    } catch {
      throw new ValidationError(
        "The submitted public key could not be parsed as OpenPGP.",
        "publicKeyArmored",
      );
    }

    if (derivedFingerprint !== input.provisioning.fingerprint) {
      throw new ValidationError(
        "The submitted public-key fingerprint does not match the uploaded key.",
        "fingerprint",
      );
    }

    let domainId = "";
    let accountId = "";
    let publicKeyId = "";
    let stalwartAccountCreated = false;

    try {
      const domain = await this.adminClient.resolveDomainByName(input.domain);
      domainId = domain.id;

      const account = await this.adminClient.createAccount({
        localPart: input.localPart,
        secret: generateMailboxCredentialSecret(),
        domainId,
        description: input.provisioning.displayName,
      });
      accountId = account.accountId;
      stalwartAccountCreated = account.created === true;

      const registeredKey = await this.adminClient.registerPublicKey({
        accountId,
        email: input.email,
        publicKeyArmored: input.provisioning.publicKeyArmored,
        description: `${input.provisioning.displayName || input.email} primary OpenPGP key`,
      });
      publicKeyId = registeredKey.publicKeyId;

      await this.adminClient.enableEncryptionAtRest({
        accountId,
        publicKeyId,
        encryptOnAppend: false,
        allowSpamTraining: false,
      });
    } catch (error) {
      logger.error("Mailbox Stalwart provisioning failed", {
        recipientRef: logRef(input.email),
        userId: input.userId,
        stalwartAccountId: accountId || null,
        stalwartAccountCreated,
        ...errorLogDetails(error),
      });
      await this.deleteOrphanedStalwartAccountIfNeeded(accountId, {
        onlyIfCreated: true,
        wasCreated: stalwartAccountCreated,
      });
      normalizeMailProvisioningError(error);
    }

    if (!domainId || !accountId || !publicKeyId) {
      throw new UpstreamServiceError(
        "Mailbox provisioning did not complete successfully.",
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingByAccountId = await tx.mailDirectoryEntry.findUnique({
          where: { stalwartAccountId: accountId },
          select: {
            id: true,
            email: true,
            userId: true,
          },
        });

        if (existingByAccountId) {
          await this.reconcileProvisionedMailboxRecord(
            tx,
            input,
            {
              stalwartAccountId: accountId,
              stalwartDomainId: domainId,
              stalwartPublicKeyId: publicKeyId,
              derivedFingerprint,
            },
            existingByAccountId,
          );
          return;
        }

        try {
          await tx.mailDirectoryEntry.create({
            data: {
              email: input.email,
              localPart: input.localPart,
              domain: input.domain,
              displayName: input.provisioning.displayName,
              stalwartAccountId: accountId,
              stalwartDomainId: domainId,
              stalwartPublicKeyId: publicKeyId,
              publicKeyArmored: input.provisioning.publicKeyArmored,
              publicKeyFingerprint: derivedFingerprint,
              keyAlgorithm: input.provisioning.algorithm,
              source: "internal",
              trust: "verified",
              keyCreatedAt: input.provisioning.createdAt,
              ...(input.userId
                ? {
                    user: {
                      connect: {
                        id: input.userId,
                      },
                    },
                  }
                : {}),
              vaultBackup: {
                create: {
                  vaultVersion: input.provisioning.vaultVersion,
                  encryptedVaultB64: input.provisioning.encryptedVaultB64,
                  kdf: input.provisioning.kdf,
                  kdfSaltB64: input.provisioning.kdfParams.saltB64,
                  kdfMemoryKiB: input.provisioning.kdfParams.memoryKiB,
                  kdfIterations: input.provisioning.kdfParams.iterations,
                  kdfParallelism: input.provisioning.kdfParams.parallelism,
                },
              },
            },
          });
        } catch (error) {
          if (
            isUniqueConstraintError(error, [
              "stalwart_account_id",
              "stalwartAccountId",
            ])
          ) {
            const concurrentEntry = await tx.mailDirectoryEntry.findUnique({
              where: { stalwartAccountId: accountId },
              select: {
                id: true,
                email: true,
                userId: true,
              },
            });

            if (concurrentEntry) {
              logger.warn(
                "Detected concurrent mail directory entry creation during mailbox provisioning",
                sanitizeLogContext({
                  email: input.email,
                  userId: input.userId ?? null,
                  stalwartAccountId: accountId,
                  directoryEntryId: concurrentEntry.id,
                }),
              );
              await this.reconcileProvisionedMailboxRecord(
                tx,
                input,
                {
                  stalwartAccountId: accountId,
                  stalwartDomainId: domainId,
                  stalwartPublicKeyId: publicKeyId,
                  derivedFingerprint,
                },
                concurrentEntry,
              );
              return;
            }
          }

          throw error;
        }
      });
    } catch (error) {
      await this.deleteOrphanedStalwartAccountIfNeeded(accountId, {
        onlyIfCreated: true,
        wasCreated: stalwartAccountCreated,
      });
      logger.error("Failed to persist provisioned mailbox state", {
        recipientRef: logRef(input.email),
        userId: input.userId ?? null,
        stalwartAccountId: accountId,
        stalwartDomainId: domainId,
        stalwartPublicKeyId: publicKeyId,
        derivedFingerprint,
        ...errorLogDetails(error),
      });
      normalizeMailPersistenceError(error);
    }

    return {
      email: input.email,
      displayName: input.provisioning.displayName,
      stalwartAccountId: accountId,
      stalwartPublicKeyId: publicKeyId,
      fingerprint: derivedFingerprint,
      encryptionAtRestEnabled: true,
    };
  }

  async getMailboxStatusForUser(
    input: GetMailAccountStatusInput,
  ): Promise<MailAccountStatusResult> {
    const normalizedEmail = normalizeEmailOrThrow(input.email);
    const mailbox = await this.findOrAttachMailboxForUser({
      userId: input.userId,
      email: normalizedEmail,
    });

    return {
      email: mailbox?.email ?? normalizedEmail,
      displayName:
        mailbox?.displayName ?? normalizeOptionalText(input.displayName),
      provisioned: Boolean(mailbox),
    };
  }

  private async mailboxHasVaultBackup(mailboxId: string): Promise<boolean> {
    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { id: mailboxId },
      select: {
        vaultBackup: {
          select: {
            id: true,
          },
        },
      },
    });

    return Boolean(entry?.vaultBackup);
  }

  private async repairMailboxForUser(input: {
    userId: string;
    mailbox: LinkedMailboxRecord;
    email: string;
    localPart: string;
    domain: string;
    provisioning: NormalizedProvisioningInput;
  }): Promise<MailSignupResult> {
    let derivedFingerprint: string;
    try {
      derivedFingerprint = normalizeFingerprint(
        await getOpenPgpPublicKeyFingerprint(
          input.provisioning.publicKeyArmored,
        ),
      );
    } catch {
      throw new ValidationError(
        "The submitted public key could not be parsed as OpenPGP.",
        "publicKeyArmored",
      );
    }

    if (derivedFingerprint !== input.provisioning.fingerprint) {
      throw new ValidationError(
        "The submitted public-key fingerprint does not match the uploaded key.",
        "fingerprint",
      );
    }

    let domainId = "";
    let accountId = input.mailbox.stalwartAccountId;
    let publicKeyId = "";
    let stalwartAccountCreated = false;

    try {
      const domain = await this.adminClient.resolveDomainByName(input.domain);
      domainId = domain.id;

      if (!accountId) {
        const account = await this.adminClient.createAccount({
          localPart: input.localPart,
          secret: generateMailboxCredentialSecret(),
          domainId,
          description: input.provisioning.displayName,
        });
        accountId = account.accountId;
        stalwartAccountCreated = account.created === true;
      }

      const registeredKey = await this.adminClient.registerPublicKey({
        accountId,
        email: input.email,
        publicKeyArmored: input.provisioning.publicKeyArmored,
        description: `${input.provisioning.displayName || input.email} primary OpenPGP key`,
      });
      publicKeyId = registeredKey.publicKeyId;

      await this.adminClient.enableEncryptionAtRest({
        accountId,
        publicKeyId,
        encryptOnAppend: false,
        allowSpamTraining: false,
      });
    } catch (error) {
      logger.error("Mailbox Stalwart repair failed", {
        recipientRef: logRef(input.email),
        userId: input.userId,
        directoryEntryId: input.mailbox.id,
        stalwartAccountId: accountId || null,
        stalwartAccountCreated,
        ...errorLogDetails(error),
      });
      await this.deleteOrphanedStalwartAccountIfNeeded(accountId, {
        onlyIfCreated: true,
        wasCreated: stalwartAccountCreated,
      });
      normalizeMailProvisioningError(error);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.reconcileProvisionedMailboxRecord(
          tx,
          {
            userId: input.userId,
            email: input.email,
            localPart: input.localPart,
            domain: input.domain,
            provisioning: input.provisioning,
          },
          {
            stalwartAccountId: accountId,
            stalwartDomainId: domainId,
            stalwartPublicKeyId: publicKeyId,
            derivedFingerprint,
          },
          {
            id: input.mailbox.id,
            email: input.mailbox.email,
            userId: input.mailbox.userId,
          },
        );
      });
    } catch (error) {
      await this.deleteOrphanedStalwartAccountIfNeeded(accountId, {
        onlyIfCreated: true,
        wasCreated: stalwartAccountCreated,
      });
      logger.error("Failed to persist repaired mailbox state", {
        recipientRef: logRef(input.email),
        userId: input.userId,
        directoryEntryId: input.mailbox.id,
        stalwartAccountId: accountId,
        ...errorLogDetails(error),
      });
      normalizeMailPersistenceError(error);
    }

    return {
      email: input.email,
      displayName: input.provisioning.displayName,
      stalwartAccountId: accountId,
      stalwartPublicKeyId: publicKeyId,
      fingerprint: derivedFingerprint,
      encryptionAtRestEnabled: true,
    };
  }

  async bootstrapForUser(
    input: MailBootstrapForUserInput,
  ): Promise<MailSignupResult> {
    const mailboxEmail = parseMailboxEmail(input.email);
    const existingMailbox = await this.findOrAttachMailboxForUser({
      userId: input.userId,
      email: mailboxEmail.email,
    });

    if (existingMailbox) {
      const hasVault = await this.mailboxHasVaultBackup(existingMailbox.id);
      if (hasVault) {
        throw new ValidationError(
          "A mailbox has already been provisioned for this account.",
          "email",
        );
      }

      return this.repairMailboxForUser({
        userId: input.userId,
        mailbox: existingMailbox,
        email: mailboxEmail.email,
        localPart: mailboxEmail.localPart,
        domain: mailboxEmail.domain,
        provisioning: normalizeProvisioningInput(input),
      });
    }

    return this.createMailbox({
      userId: input.userId,
      email: mailboxEmail.email,
      localPart: mailboxEmail.localPart,
      domain: mailboxEmail.domain,
      provisioning: normalizeProvisioningInput(input),
    });
  }

  async getDirectoryKey(email: string): Promise<MailDirectoryKeyResult> {
    const normalizedEmail = normalizeEmail(email);
    const directorySelect = {
      email: true,
      publicKeyArmored: true,
      publicKeyFingerprint: true,
      source: true,
      trust: true,
    } as const;

    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: normalizedEmail },
      select: directorySelect,
    });

    if (entry) {
      return this.toDirectoryKeyResult(entry);
    }

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (user) {
      const linkedEntry = await this.prisma.mailDirectoryEntry.findUnique({
        where: { userId: user.id },
        select: directorySelect,
      });
      if (linkedEntry) {
        return this.toDirectoryKeyResult(linkedEntry);
      }
    }

    const remoteKey = await this.resolveRemoteDirectoryKey(normalizedEmail);
    if (remoteKey) {
      return remoteKey;
    }

    throw new NotFoundError(
      "No internal public key was found for that email.",
    );
  }

  private toDirectoryKeyResult(entry: {
    email: string;
    publicKeyArmored: string;
    publicKeyFingerprint: string;
    source: string;
    trust: string;
  }): MailDirectoryKeyResult {
    return {
      email: entry.email,
      publicKeyArmored: entry.publicKeyArmored,
      fingerprint: entry.publicKeyFingerprint,
      source: entry.source,
      trust: entry.trust,
    };
  }

  private async resolveRemoteDirectoryKey(
    normalizedEmail: string,
  ): Promise<MailDirectoryKeyResult | null> {
    const configuredDomain = this.config.defaultDomain.trim().toLowerCase();
    const separatorIndex = normalizedEmail.lastIndexOf("@");
    if (separatorIndex <= 0) {
      return null;
    }

    const domain = normalizedEmail.slice(separatorIndex + 1);
    if (domain !== configuredDomain) {
      return null;
    }

    let remote: Awaited<
      ReturnType<StalwartAdminClientLike["resolveMailboxPublicKey"]>
    >;
    try {
      remote = await this.adminClient.resolveMailboxPublicKey({
        email: normalizedEmail,
      });
    } catch (error) {
      logger.warn("Failed to resolve mailbox public key from Stalwart", {
        recipientRef: logRef(normalizedEmail),
        ...errorLogDetails(error),
      });
      return null;
    }

    if (!remote) {
      return null;
    }

    logger.info(
      "Resolved mailbox public key from Stalwart after missing directory entry",
      {
        recipientRef: logRef(normalizedEmail),
        stalwartAccountId: remote.stalwartAccountId,
      },
    );

    return {
      email: normalizedEmail,
      publicKeyArmored: remote.publicKeyArmored,
      fingerprint: await getOpenPgpPublicKeyFingerprint(remote.publicKeyArmored),
      source: "internal",
      trust: "verified",
    };
  }

  async getVaultBackup(email: string): Promise<MailVaultBackupResult> {
    const normalizedEmail = normalizeEmail(email);
    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: normalizedEmail },
      select: {
        email: true,
        vaultBackup: {
          select: {
            vaultVersion: true,
            encryptedVaultB64: true,
            kdf: true,
            kdfSaltB64: true,
            kdfMemoryKiB: true,
            kdfIterations: true,
            kdfParallelism: true,
          },
        },
      },
    });

    if (!entry?.vaultBackup) {
      throw new NotFoundError(
        "No encrypted vault backup was found for that mailbox.",
      );
    }

    return {
      email: entry.email,
      vaultVersion: entry.vaultBackup.vaultVersion,
      encryptedVaultB64: entry.vaultBackup.encryptedVaultB64,
      kdf: entry.vaultBackup.kdf,
      kdfParams: {
        saltB64: entry.vaultBackup.kdfSaltB64,
        memoryKiB: entry.vaultBackup.kdfMemoryKiB,
        iterations: entry.vaultBackup.kdfIterations,
        parallelism: entry.vaultBackup.kdfParallelism,
      },
    };
  }

  async getVaultBackupForUser(
    input: GetMailVaultBackupForUserInput,
  ): Promise<MailVaultBackupResult> {
    const normalizedEmail = normalizeEmailOrThrow(input.email);
    const mailbox = await this.findOrAttachMailboxForUser({
      userId: input.userId,
      email: normalizedEmail,
    });

    if (!mailbox) {
      throw new NotFoundError(
        "No encrypted vault backup was found for this mailbox.",
      );
    }

    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { id: mailbox.id },
      select: {
        email: true,
        vaultBackup: {
          select: {
            vaultVersion: true,
            encryptedVaultB64: true,
            kdf: true,
            kdfSaltB64: true,
            kdfMemoryKiB: true,
            kdfIterations: true,
            kdfParallelism: true,
          },
        },
      },
    });

    if (!entry?.vaultBackup) {
      throw new NotFoundError(
        "No encrypted vault backup was found for this mailbox.",
      );
    }

    return {
      email: entry.email,
      vaultVersion: entry.vaultBackup.vaultVersion,
      encryptedVaultB64: entry.vaultBackup.encryptedVaultB64,
      kdf: entry.vaultBackup.kdf,
      kdfParams: {
        saltB64: entry.vaultBackup.kdfSaltB64,
        memoryKiB: entry.vaultBackup.kdfMemoryKiB,
        iterations: entry.vaultBackup.kdfIterations,
        parallelism: entry.vaultBackup.kdfParallelism,
      },
    };
  }

  async upsertVaultBackup(
    input: UpsertMailVaultBackupInput,
  ): Promise<MailVaultBackupResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const encryptedVaultB64 = input.encryptedVaultB64.trim();

    if (!encryptedVaultB64) {
      throw new ValidationError(
        "An encrypted vault backup is required.",
        "encryptedVaultB64",
      );
    }

    assertVaultParams(input.kdf, input.kdfParams);

    const record = await this.prisma.mailDirectoryEntry.update({
      where: { email: normalizedEmail },
      data: {
        vaultBackup: {
          upsert: {
            create: {
              vaultVersion: input.vaultVersion,
              encryptedVaultB64,
              kdf: input.kdf.trim().toLowerCase(),
              kdfSaltB64: input.kdfParams.saltB64.trim(),
              kdfMemoryKiB: input.kdfParams.memoryKiB,
              kdfIterations: input.kdfParams.iterations,
              kdfParallelism: input.kdfParams.parallelism,
            },
            update: {
              vaultVersion: input.vaultVersion,
              encryptedVaultB64,
              kdf: input.kdf.trim().toLowerCase(),
              kdfSaltB64: input.kdfParams.saltB64.trim(),
              kdfMemoryKiB: input.kdfParams.memoryKiB,
              kdfIterations: input.kdfParams.iterations,
              kdfParallelism: input.kdfParams.parallelism,
            },
          },
        },
      },
      select: {
        email: true,
        vaultBackup: {
          select: {
            vaultVersion: true,
            encryptedVaultB64: true,
            kdf: true,
            kdfSaltB64: true,
            kdfMemoryKiB: true,
            kdfIterations: true,
            kdfParallelism: true,
          },
        },
      },
    });

    if (!record.vaultBackup) {
      throw new NotFoundError(
        "No encrypted vault backup was stored for that mailbox.",
      );
    }

    return {
      email: record.email,
      vaultVersion: record.vaultBackup.vaultVersion,
      encryptedVaultB64: record.vaultBackup.encryptedVaultB64,
      kdf: record.vaultBackup.kdf,
      kdfParams: {
        saltB64: record.vaultBackup.kdfSaltB64,
        memoryKiB: record.vaultBackup.kdfMemoryKiB,
        iterations: record.vaultBackup.kdfIterations,
        parallelism: record.vaultBackup.kdfParallelism,
      },
    };
  }

  async upsertVaultBackupForUser(
    input: UpsertMailVaultBackupForUserInput,
  ): Promise<MailVaultBackupResult> {
    const mailbox = await this.findOrAttachMailboxForUser({
      userId: input.userId,
      email: normalizeEmailOrThrow(input.email),
    });

    if (!mailbox) {
      throw new NotFoundError(
        "No encrypted vault backup was stored for that mailbox.",
      );
    }

    return this.upsertVaultBackup({
      email: mailbox.email,
      vaultVersion: input.vaultVersion,
      encryptedVaultB64: input.encryptedVaultB64,
      kdf: input.kdf,
      kdfParams: input.kdfParams,
    });
  }
}

function isJmapAdminClient(
  client: StalwartAdminClientLike,
): client is StalwartJmapAdminClientLike {
  return typeof (client as StalwartJmapAdminClientLike).callJmap === "function";
}
