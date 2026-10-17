import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  IRecentContactsService,
  RecentContactsRecord,
  RecentContactsUpsertInput,
} from "../contracts/recent-contacts.contract";

const DEFAULT_ENCRYPTION_KEY_VERSION = 1;

function mapRecord(record: {
  encryptedContent: string;
  encryptionKeyVersion: number;
  updatedAt: Date;
}): RecentContactsRecord {
  return {
    encryptedContent: record.encryptedContent,
    encryptionKeyVersion: record.encryptionKeyVersion,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class RecentContactsService implements IRecentContactsService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<RecentContactsRecord | null> {
    const record = await this.prisma.userRecentContacts.findUnique({
      where: { userId },
      select: {
        encryptedContent: true,
        encryptionKeyVersion: true,
        updatedAt: true,
      },
    });

    return record ? mapRecord(record) : null;
  }

  async upsert(input: RecentContactsUpsertInput): Promise<RecentContactsRecord> {
    const { userId, encryptedContent, encryptionKeyVersion } = input;

    const record = await this.prisma.userRecentContacts.upsert({
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
