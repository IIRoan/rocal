import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  IMailSettingsService,
  MailSettingsRecord,
  MailSettingsUpsertInput,
} from "../contracts/mail-settings.contract";

const DEFAULT_ENCRYPTION_KEY_VERSION = 1;

function mapRecord(record: {
  encryptedContent: string;
  encryptionKeyVersion: number;
  updatedAt: Date;
}): MailSettingsRecord {
  return {
    encryptedContent: record.encryptedContent,
    encryptionKeyVersion: record.encryptionKeyVersion,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class MailSettingsService implements IMailSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<MailSettingsRecord | null> {
    const record = await this.prisma.userMailSettings.findUnique({
      where: { userId },
      select: {
        encryptedContent: true,
        encryptionKeyVersion: true,
        updatedAt: true,
      },
    });

    return record ? mapRecord(record) : null;
  }

  async upsert(input: MailSettingsUpsertInput): Promise<MailSettingsRecord> {
    const { userId, encryptedContent, encryptionKeyVersion } = input;

    const record = await this.prisma.userMailSettings.upsert({
      where: { userId },
      create: {
        userId,
        encryptedContent,
        encryptionKeyVersion:
          encryptionKeyVersion ?? DEFAULT_ENCRYPTION_KEY_VERSION,
      },
      update: {
        encryptedContent,
        ...(encryptionKeyVersion !== undefined
          ? { encryptionKeyVersion }
          : {}),
      },
      select: {
        encryptedContent: true,
        encryptionKeyVersion: true,
        updatedAt: true,
      },
    });

    return mapRecord(record);
  }
}
