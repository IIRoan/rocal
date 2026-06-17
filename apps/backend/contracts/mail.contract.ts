import { z } from "zod";
import type {
  MailAccountStatus as SharedMailAccountStatus,
  MailDemoConfig,
  MailDirectoryKey as SharedMailDirectoryKey,
  MailOAuthConfig,
  MailSignup as SharedMailSignup,
  MailVaultBackup as SharedMailVaultBackup,
  MailVaultKdfParams,
} from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { userIdField } from "./_zod";

export type { MailDemoConfig, MailOAuthConfig, MailVaultKdfParams };

export const kdfParamsSchema = strictZodObject({
  saltB64: z.string().min(1).max(512),
  memoryKiB: z.number().int().min(8192).max(1_048_576),
  iterations: z.number().int().min(1).max(16),
  parallelism: z.number().int().min(1).max(32),
});

export const bootstrapBodySchema = strictZodObject({
  publicKeyArmored: z.string().min(1).max(131_072),
  fingerprint: z.string().min(16).max(128),
  algorithm: z.string().min(1).max(32),
  createdAt: z.string().min(1).max(64),
  vaultVersion: z.number().int().min(1).max(10),
  encryptedVaultB64: z.string().min(1).max(500_000),
  kdf: z.string().min(1).max(32),
  kdfParams: kdfParamsSchema,
});

export const vaultBackupBodySchema = strictZodObject({
  vaultVersion: z.number().int().min(1).max(10),
  encryptedVaultB64: z.string().min(1).max(500_000),
  kdf: z.string().min(1).max(32),
  kdfParams: kdfParamsSchema,
});

export const mailSyncQuerySchema = strictZodObject({
  accountId: z.string().min(1).max(128),
});

export const mailBootstrapForUserInputSchema = bootstrapBodySchema.extend({
  ...userIdField,
  email: z.string().min(1).max(320),
  displayName: z.string().max(120).nullable().optional(),
});

export const getMailAccountStatusInputSchema = z
  .object({
    userId: userIdField.userId,
    email: z.string().min(1).max(320),
    displayName: z.string().max(120).nullable().optional(),
  })
  .strict();

export const getMailVaultBackupForUserInputSchema = z
  .object({
    userId: userIdField.userId,
    email: z.string().min(1).max(320),
  })
  .strict();

export const upsertMailVaultBackupForUserInputSchema =
  vaultBackupBodySchema.extend({
    userId: userIdField.userId,
    email: z.string().min(1).max(320),
  });

export const mailAccessTokenForUserInputSchema = z
  .object({
    userId: userIdField.userId,
    email: z.string().min(1).max(320),
  })
  .strict();

export const deleteMailboxForUserInputSchema = z.object(userIdField).strict();

export type MailAccountStatusResult = SharedMailAccountStatus;
export type MailAccessTokenForUserInput = z.infer<
  typeof mailAccessTokenForUserInputSchema
>;
export type MailAccessTokenResult = {
  access_token: string;
  expires_in: number;
  expires_at: number;
};
export type MailSignupResult = SharedMailSignup;
export type MailDirectoryKeyResult = SharedMailDirectoryKey;
export type MailVaultBackupResult = SharedMailVaultBackup;
export type MailBootstrapForUserInput = z.infer<
  typeof mailBootstrapForUserInputSchema
>;
export type GetMailAccountStatusInput = z.infer<
  typeof getMailAccountStatusInputSchema
>;
export type GetMailVaultBackupForUserInput = z.infer<
  typeof getMailVaultBackupForUserInputSchema
>;
export type UpsertMailVaultBackupInput = SharedMailVaultBackup;
export type UpsertMailVaultBackupForUserInput = z.infer<
  typeof upsertMailVaultBackupForUserInputSchema
>;
export type DeleteMailboxForUserInput = z.infer<
  typeof deleteMailboxForUserInputSchema
>;

export interface IMailService {
  getConfig(): MailDemoConfig;
  issueAccessTokenForUser(
    input: MailAccessTokenForUserInput,
  ): Promise<MailAccessTokenResult>;
  getAccessTokenForUser(
    input: MailAccessTokenForUserInput,
  ): Promise<MailAccessTokenResult>;
  invalidateAccessTokenForUser(userId: string): void;
  getMailboxStatusForUser(
    input: GetMailAccountStatusInput,
  ): Promise<MailAccountStatusResult>;
  bootstrapForUser(input: MailBootstrapForUserInput): Promise<MailSignupResult>;
  getDirectoryKey(email: string): Promise<MailDirectoryKeyResult>;
  getVaultBackup(email: string): Promise<MailVaultBackupResult>;
  getVaultBackupForUser(
    input: GetMailVaultBackupForUserInput,
  ): Promise<MailVaultBackupResult>;
  upsertVaultBackup(
    input: UpsertMailVaultBackupInput,
  ): Promise<MailVaultBackupResult>;
  upsertVaultBackupForUser(
    input: UpsertMailVaultBackupForUserInput,
  ): Promise<MailVaultBackupResult>;
  deleteMailboxForUser(input: DeleteMailboxForUserInput): Promise<void>;
}
