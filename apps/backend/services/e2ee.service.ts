import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  E2eeBootstrapResult,
  EncryptionCalendarRecord,
  EncryptionDeviceRecord,
  IE2eeService,
  UpsertEncryptionDeviceInput,
} from "../contracts/e2ee.contract";
import { ValidationError } from "../lib/errors";

const DEFAULT_PUBLIC_KEY_ALGORITHM = "RSA-OAEP-256";
const DEFAULT_WRAP_ALGORITHM = "RSA-OAEP-256";

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

export class E2eeService implements IE2eeService {
  constructor(private readonly prisma: PrismaClient) {}

  async getBootstrap(userId: string): Promise<E2eeBootstrapResult> {
    const [devices, calendars] = await Promise.all([
      this.prisma.userEncryptionDevice.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: "desc" }, { createdAt: "asc" }],
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
      calendars: calendars.map((calendar): EncryptionCalendarRecord => ({
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
      })),
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
}