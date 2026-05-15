import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  E2eeBootstrapResult,
  E2eeResetSnapshotResult,
  EncryptionCalendarRecord,
  EncryptionCategoryRecord,
  EncryptionDeviceRecord,
  EncryptionEventRecord,
  EncryptionPasswordRecord,
  IE2eeService,
  UpsertEncryptionDeviceInput,
  UpsertEncryptionPasswordInput,
} from "../contracts/e2ee.contract";
import { ValidationError } from "../lib/errors";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:e2ee-service");

const DEFAULT_PUBLIC_KEY_ALGORITHM = "RSA-OAEP-256";
const DEFAULT_WRAP_ALGORITHM = "RSA-OAEP-256";
const DEFAULT_PASSWORD_KDF_ALGORITHM = "PBKDF2-SHA-256";
const DEFAULT_PASSWORD_WRAP_ALGORITHM = "AES-GCM-256";
const DEFAULT_PASSWORD_KDF_ITERATIONS = 310000;

function parseBlindIndexTokens(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    return [];
  }

  return [];
}

function mapCalendarRecord(calendar: {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string | null;
  encryptionState: string;
  encryptionKeyVersion: number;
  color: string;
  kind: string;
  isDefault: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}): EncryptionCalendarRecord {
  return {
    id: calendar.id,
    name: calendar.name,
    encryptedName: calendar.encryptedName,
    blindIndexTokens: parseBlindIndexTokens(calendar.blindIndexTokens),
    encryptionState: calendar.encryptionState,
    encryptionKeyVersion: calendar.encryptionKeyVersion,
    color: calendar.color,
    kind: calendar.kind,
    isDefault: calendar.isDefault,
    isVisible: calendar.isVisible,
    createdAt: calendar.createdAt,
    updatedAt: calendar.updatedAt,
  };
}

function mapCategoryRecord(category: {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string | null;
  encryptionState: string;
  encryptionKeyVersion: number;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): EncryptionCategoryRecord {
  return {
    id: category.id,
    name: category.name,
    encryptedName: category.encryptedName,
    blindIndexTokens: parseBlindIndexTokens(category.blindIndexTokens),
    encryptionState: category.encryptionState,
    encryptionKeyVersion: category.encryptionKeyVersion,
    color: category.color,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function mapEventRecord(event: {
  id: string;
  title: string;
  description: string | null;
  encryptedContent: string | null;
  blindIndexTokens: string | null;
  encryptionState: string;
  encryptionKeyVersion: number;
  start: Date;
  end: Date;
  timezone: string | null;
  allDay: boolean;
  location: string | null;
  color: string | null;
  calendarId: string;
  categoryId: string | null;
  reminder: number | null;
  recurrence: string | null;
  parentEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EncryptionEventRecord {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    encryptedContent: event.encryptedContent,
    blindIndexTokens: parseBlindIndexTokens(event.blindIndexTokens),
    encryptionState: event.encryptionState,
    encryptionKeyVersion: event.encryptionKeyVersion,
    start: event.start,
    end: event.end,
    timezone: event.timezone,
    allDay: event.allDay,
    location: event.location,
    color: event.color,
    calendarId: event.calendarId,
    categoryId: event.categoryId,
    reminder: event.reminder,
    recurrence: event.recurrence,
    parentEventId: event.parentEventId,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export class E2eeService implements IE2eeService {
  constructor(private readonly prisma: PrismaClient) {}

  async getBootstrap(userId: string): Promise<E2eeBootstrapResult> {
    const [devices, passwordEnvelope, calendars] = await Promise.all([
      this.prisma.userEncryptionDevice.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "asc" }],
      }),
      this.prisma.userEncryptionPassword.findUnique({
        where: { userId },
      }),
      this.prisma.calendar.findMany({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
    ]);

    return {
      enabled: true,
      rolloutStage: "shadow_write",
      algorithms: {
        content: "AES-GCM-256",
        blindIndex: "HMAC-SHA-256",
        wrapping: DEFAULT_WRAP_ALGORITHM,
        passwordWrapping: DEFAULT_PASSWORD_WRAP_ALGORITHM,
      },
      devices: devices.map((device): EncryptionDeviceRecord => ({
        id: device.id,
        userId: device.userId,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        publicKey: device.publicKey,
        publicKeyAlgorithm: device.publicKeyAlgorithm,
        wrappedAccountKey: device.wrappedAccountKey,
        wrappedSearchKey: device.wrappedSearchKey,
        wrapAlgorithm: device.wrapAlgorithm,
        keyVersion: device.keyVersion,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      })),
      passwordEnvelope: passwordEnvelope
        ? {
            id: passwordEnvelope.id,
            userId: passwordEnvelope.userId,
            kdfAlgorithm: passwordEnvelope.kdfAlgorithm,
            kdfSalt: passwordEnvelope.kdfSalt,
            kdfIterations: passwordEnvelope.kdfIterations,
            wrappedAccountKey: passwordEnvelope.wrappedAccountKey,
            wrappedSearchKey: passwordEnvelope.wrappedSearchKey,
            wrapAlgorithm: passwordEnvelope.wrapAlgorithm,
            keyVersion: passwordEnvelope.keyVersion,
            createdAt: passwordEnvelope.createdAt,
            updatedAt: passwordEnvelope.updatedAt,
          }
        : null,
      calendars: calendars.map(mapCalendarRecord),
    };
  }

  async getResetSnapshot(userId: string): Promise<E2eeResetSnapshotResult> {
    const [calendars, categories, events] = await Promise.all([
      this.prisma.calendar.findMany({
        where: {
          userId,
          kind: "owned",
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      this.prisma.eventCategory.findMany({
        where: {
          userId,
          isActive: true,
        },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          isSynced: false,
        },
        orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return {
      calendars: calendars.map(mapCalendarRecord),
      categories: categories.map(mapCategoryRecord),
      events: events.map(mapEventRecord),
    };
  }

  async upsertDevice(
    input: UpsertEncryptionDeviceInput,
  ): Promise<EncryptionDeviceRecord> {
    const deviceId = input.deviceId.trim();
    const publicKey = input.publicKey.trim();
    const wrappedAccountKey = input.wrappedAccountKey.trim();
    const wrappedSearchKey = input.wrappedSearchKey.trim();
    const deviceLabel = input.deviceLabel?.trim() || null;
    const publicKeyAlgorithm =
      input.publicKeyAlgorithm?.trim() || DEFAULT_PUBLIC_KEY_ALGORITHM;
    const wrapAlgorithm = input.wrapAlgorithm?.trim() || DEFAULT_WRAP_ALGORITHM;
    const keyVersion = input.keyVersion ?? 1;

    if (!deviceId) {
      throw new ValidationError("Device ID is required", "deviceId");
    }

    if (!publicKey) {
      throw new ValidationError("Public key is required", "publicKey");
    }

    if (!wrappedAccountKey) {
      throw new ValidationError(
        "Wrapped account key is required",
        "wrappedAccountKey",
      );
    }

    if (!wrappedSearchKey) {
      throw new ValidationError(
        "Wrapped search key is required",
        "wrappedSearchKey",
      );
    }

    if (keyVersion < 1) {
      throw new ValidationError(
        "Key version must be at least 1",
        "keyVersion",
      );
    }

    const device = await this.prisma.userEncryptionDevice.upsert({
      where: {
        userId_deviceId: {
          userId: input.userId,
          deviceId,
        },
      },
      create: {
        userId: input.userId,
        deviceId,
        deviceLabel,
        publicKey,
        publicKeyAlgorithm,
        wrappedAccountKey,
        wrappedSearchKey,
        wrapAlgorithm,
        keyVersion,
        lastSeenAt: new Date(),
      },
      update: {
        deviceLabel,
        publicKey,
        publicKeyAlgorithm,
        wrappedAccountKey,
        wrappedSearchKey,
        wrapAlgorithm,
        keyVersion,
        lastSeenAt: new Date(),
      },
    });

    return {
      id: device.id,
      userId: device.userId,
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      publicKey: device.publicKey,
      publicKeyAlgorithm: device.publicKeyAlgorithm,
      wrappedAccountKey: device.wrappedAccountKey,
      wrappedSearchKey: device.wrappedSearchKey,
      wrapAlgorithm: device.wrapAlgorithm,
      keyVersion: device.keyVersion,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }

  async upsertPasswordEnvelope(
    input: UpsertEncryptionPasswordInput,
  ): Promise<EncryptionPasswordRecord> {
    const kdfAlgorithm =
      input.kdfAlgorithm?.trim() || DEFAULT_PASSWORD_KDF_ALGORITHM;
    const kdfSalt = input.kdfSalt.trim();
    const kdfIterations =
      input.kdfIterations ?? DEFAULT_PASSWORD_KDF_ITERATIONS;
    const wrappedAccountKey = input.wrappedAccountKey.trim();
    const wrappedSearchKey = input.wrappedSearchKey.trim();
    const wrapAlgorithm =
      input.wrapAlgorithm?.trim() || DEFAULT_PASSWORD_WRAP_ALGORITHM;
    const keyVersion = input.keyVersion ?? 1;

    if (!kdfSalt) {
      throw new ValidationError("KDF salt is required", "kdfSalt");
    }

    if (kdfIterations < 100000) {
      throw new ValidationError(
        "KDF iterations must be at least 100000",
        "kdfIterations",
      );
    }

    if (!wrappedAccountKey) {
      throw new ValidationError(
        "Wrapped account key is required",
        "wrappedAccountKey",
      );
    }

    if (!wrappedSearchKey) {
      throw new ValidationError(
        "Wrapped search key is required",
        "wrappedSearchKey",
      );
    }

    if (keyVersion < 1) {
      throw new ValidationError(
        "Key version must be at least 1",
        "keyVersion",
      );
    }

    const passwordEnvelope = await this.prisma.userEncryptionPassword.upsert({
      where: {
        userId: input.userId,
      },
      create: {
        userId: input.userId,
        kdfAlgorithm,
        kdfSalt,
        kdfIterations,
        wrappedAccountKey,
        wrappedSearchKey,
        wrapAlgorithm,
        keyVersion,
      },
      update: {
        kdfAlgorithm,
        kdfSalt,
        kdfIterations,
        wrappedAccountKey,
        wrappedSearchKey,
        wrapAlgorithm,
        keyVersion,
      },
    });

    return {
      id: passwordEnvelope.id,
      userId: passwordEnvelope.userId,
      kdfAlgorithm: passwordEnvelope.kdfAlgorithm,
      kdfSalt: passwordEnvelope.kdfSalt,
      kdfIterations: passwordEnvelope.kdfIterations,
      wrappedAccountKey: passwordEnvelope.wrappedAccountKey,
      wrappedSearchKey: passwordEnvelope.wrappedSearchKey,
      wrapAlgorithm: passwordEnvelope.wrapAlgorithm,
      keyVersion: passwordEnvelope.keyVersion,
      createdAt: passwordEnvelope.createdAt,
      updatedAt: passwordEnvelope.updatedAt,
    };
  }
}