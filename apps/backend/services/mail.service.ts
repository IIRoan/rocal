import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/index.js";
import { ValidationError, NotFoundError } from "../lib/errors";
import { getOpenPgpPublicKeyFingerprint } from "../lib/mail-key-utils";
import type {
  GetMailAccountStatusInput,
  GetMailVaultBackupForUserInput,
  IMailService,
  MailAccountStatusResult,
  MailBootstrapForUserInput,
  MailDemoConfig,
  MailDirectoryKeyResult,
  MailSignupInput,
  MailSignupResult,
  MailVaultKdfParams,
  MailVaultBackupResult,
  UpsertMailVaultBackupInput,
  UpsertMailVaultBackupForUserInput,
} from "../contracts/mail.contract";
import type { StalwartAdminClientLike } from "../lib/stalwart-admin";

const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MIN_MAILBOX_PASSWORD_LENGTH = 12;
const MIN_VAULT_MEMORY_KIB = 8192;
const emailSchema = z.string().email();

type NormalizedProvisioningInput = {
  displayName: string | null;
  password: string;
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

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeLocalPart(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmailOrThrow(value: string, field: string = "email"): string {
  const normalized = normalizeEmail(value);

  if (!emailSchema.safeParse(normalized).success) {
    throw new ValidationError("A valid email address is required.", field);
  }

  return normalized;
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
    throw new ValidationError(
      "Mail vault backups must use Argon2id.",
      "kdf",
    );
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
  password: string;
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
  const password = input.password.trim();
  const publicKeyArmored = input.publicKeyArmored.trim();
  const fingerprint = normalizeFingerprint(input.fingerprint);
  const algorithm = input.algorithm.trim().toLowerCase();
  const createdAt = new Date(input.createdAt);
  const encryptedVaultB64 = input.encryptedVaultB64.trim();

  if (password.length < MIN_MAILBOX_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Mailbox passwords must be at least ${MIN_MAILBOX_PASSWORD_LENGTH} characters long.`,
      "password",
    );
  }

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
    password,
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

export class MailService implements IMailService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adminClient: StalwartAdminClientLike,
    private readonly config: {
      defaultDomain: string;
      discoveryBaseUrl: string;
    },
  ) {}

  getConfig(): MailDemoConfig {
    return {
      defaultDomain: this.config.defaultDomain,
      discoveryBaseUrl: this.config.discoveryBaseUrl,
      signupEnabled: true,
      loginMode: "basic",
    };
  }

  private async findOrAttachMailboxForUser(input: {
    userId: string;
    email: string;
  }): Promise<LinkedMailboxRecord | null> {
    const entryByUserId = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId: input.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        stalwartAccountId: true,
        stalwartPublicKeyId: true,
        publicKeyFingerprint: true,
        userId: true,
      },
    });

    if (entryByUserId) {
      return entryByUserId;
    }

    const entryByEmail = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        displayName: true,
        stalwartAccountId: true,
        stalwartPublicKeyId: true,
        publicKeyFingerprint: true,
        userId: true,
      },
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
      select: {
        id: true,
        email: true,
        displayName: true,
        stalwartAccountId: true,
        stalwartPublicKeyId: true,
        publicKeyFingerprint: true,
        userId: true,
      },
    });
  }

  private async createMailbox(input: {
    userId?: string | null;
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
        await getOpenPgpPublicKeyFingerprint(input.provisioning.publicKeyArmored),
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

    const domain = await this.adminClient.resolveDomainByName(input.domain);
    const account = await this.adminClient.createAccount({
      localPart: input.localPart,
      password: input.provisioning.password,
      domainId: domain.id,
      description: input.provisioning.displayName,
    });
    const { publicKeyId } = await this.adminClient.registerPublicKey({
      accountId: account.accountId,
      email: input.email,
      publicKeyArmored: input.provisioning.publicKeyArmored,
      description: `${input.provisioning.displayName || input.email} primary OpenPGP key`,
    });

    await this.adminClient.enableEncryptionAtRest({
      accountId: account.accountId,
      publicKeyId,
      encryptOnAppend: false,
      allowSpamTraining: false,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.mailDirectoryEntry.create({
        data: {
          email: input.email,
          localPart: input.localPart,
          domain: input.domain,
          displayName: input.provisioning.displayName,
          stalwartAccountId: account.accountId,
          stalwartDomainId: domain.id,
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
    });

    return {
      email: input.email,
      displayName: input.provisioning.displayName,
      stalwartAccountId: account.accountId,
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
      displayName: mailbox?.displayName ?? normalizeOptionalText(input.displayName),
      provisioned: Boolean(mailbox),
    };
  }

  async signUp(input: MailSignupInput): Promise<MailSignupResult> {
    const localPart = normalizeLocalPart(input.localPart);
    const email = `${localPart}@${this.config.defaultDomain}`;

    if (!LOCAL_PART_PATTERN.test(localPart)) {
      throw new ValidationError(
        "Mailbox local parts may only contain lowercase letters, numbers, dots, underscores, and hyphens.",
        "localPart",
      );
    }

    return this.createMailbox({
      email,
      localPart,
      domain: this.config.defaultDomain,
      provisioning: normalizeProvisioningInput(input),
    });
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
      throw new ValidationError(
        "A mailbox has already been provisioned for this account.",
        "email",
      );
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
    const entry = await this.prisma.mailDirectoryEntry.findUnique({
      where: { email: normalizedEmail },
      select: {
        email: true,
        publicKeyArmored: true,
        publicKeyFingerprint: true,
        source: true,
        trust: true,
      },
    });

    if (!entry) {
      throw new NotFoundError("No internal public key was found for that email.");
    }

    return {
      email: entry.email,
      publicKeyArmored: entry.publicKeyArmored,
      fingerprint: entry.publicKeyFingerprint,
      source: entry.source,
      trust: entry.trust,
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
      throw new NotFoundError("No encrypted vault backup was found for that mailbox.");
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
      throw new NotFoundError("No encrypted vault backup was stored for that mailbox.");
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