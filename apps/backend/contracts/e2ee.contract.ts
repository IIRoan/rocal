import { z } from "zod";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export const deviceBodySchema = strictZodObject({
  deviceId: z.string().min(1).max(128),
  deviceLabel: z.string().max(120).optional(),
  publicKey: z.string().min(1).max(32768),
  publicKeyAlgorithm: z.string().max(64).optional(),
  wrappedAccountKey: z.string().min(1).max(32768),
  wrappedSearchKey: z.string().min(1).max(32768),
  wrapAlgorithm: z.string().max(64).optional(),
  keyVersion: z.number().int().min(1).max(1000).optional(),
});

export const passwordBodySchema = strictZodObject({
  kdfAlgorithm: z.string().max(64).optional(),
  kdfSalt: z.string().min(1).max(512),
  kdfIterations: z.number().int().min(100_000).max(5_000_000).optional(),
  wrappedAccountKey: z.string().min(1).max(32768),
  wrappedSearchKey: z.string().min(1).max(32768),
  wrapAlgorithm: z.string().max(64).optional(),
  keyVersion: z.number().int().min(1).max(1000).optional(),
});

export const upsertEncryptionDeviceInputSchema =
  deviceBodySchema.extend(userIdField);

export const upsertEncryptionPasswordInputSchema =
  passwordBodySchema.extend(userIdField);

export type EncryptionDeviceRecord = {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  publicKey: string;
  publicKeyAlgorithm: string;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type EncryptionPasswordRecord = {
  id: string;
  userId: string;
  kdfAlgorithm: string;
  kdfSalt: string;
  kdfIterations: number;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EncryptionCalendarRecord = {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string[];
  encryptionState: string;
  encryptionKeyVersion: number;
  color: string;
  kind: string;
  isDefault: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type EncryptionCategoryRecord = {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string[];
  encryptionState: string;
  encryptionKeyVersion: number;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type EncryptionEventRecord = {
  id: string;
  title: string;
  description: string | null;
  encryptedContent: string | null;
  blindIndexTokens: string[];
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
};

export type E2eeBootstrapResult = {
  enabled: true;
  rolloutStage: "shadow_write";
  algorithms: {
    content: "AES-GCM-256";
    blindIndex: "HMAC-SHA-256";
    wrapping: string;
    passwordWrapping: string;
  };
  devices: EncryptionDeviceRecord[];
  passwordEnvelope: EncryptionPasswordRecord | null;
  calendars: EncryptionCalendarRecord[];
};

export type E2eeResetSnapshotResult = {
  calendars: EncryptionCalendarRecord[];
  categories: EncryptionCategoryRecord[];
  events: EncryptionEventRecord[];
};

export type UpsertEncryptionDeviceInput = z.infer<
  typeof upsertEncryptionDeviceInputSchema
>;
export type UpsertEncryptionPasswordInput = z.infer<
  typeof upsertEncryptionPasswordInputSchema
>;

export interface IE2eeService {
  getBootstrap(userId: string): Promise<E2eeBootstrapResult>;
  getResetSnapshot(userId: string): Promise<E2eeResetSnapshotResult>;
  upsertDevice(
    input: UpsertEncryptionDeviceInput,
  ): Promise<EncryptionDeviceRecord>;
  upsertPasswordEnvelope(
    input: UpsertEncryptionPasswordInput,
  ): Promise<EncryptionPasswordRecord>;
}
