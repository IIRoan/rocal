import type {
  MailAccountStatus as SharedMailAccountStatus,
  MailDemoConfig,
  MailDirectoryKey as SharedMailDirectoryKey,
  MailOAuthConfig,
  MailSignup as SharedMailSignup,
  MailVaultBackup as SharedMailVaultBackup,
  MailVaultKdfParams,
} from "@workspace/calendar-core";

export type { MailDemoConfig, MailOAuthConfig, MailVaultKdfParams };

export type MailAccountStatusResult = SharedMailAccountStatus;

export type MailAccessTokenForUserInput = {
  userId: string;
  email: string;
};

export type MailAccessTokenResult = {
  access_token: string;
  expires_in: number;
  expires_at: number;
};

export type MailSignupResult = SharedMailSignup;

export type MailDirectoryKeyResult = SharedMailDirectoryKey;

export type MailVaultBackupResult = SharedMailVaultBackup;

export type MailBootstrapForUserInput = {
  userId: string;
  email: string;
  displayName?: string | null;
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
  createdAt: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type GetMailAccountStatusInput = {
  userId: string;
  email: string;
  displayName?: string | null;
};

export type GetMailVaultBackupForUserInput = {
  userId: string;
  email: string;
};

export type UpsertMailVaultBackupInput = SharedMailVaultBackup;

export type UpsertMailVaultBackupForUserInput = {
  userId: string;
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type DeleteMailboxForUserInput = {
  userId: string;
};

export interface IMailService {
  getConfig(): MailDemoConfig;
  issueAccessTokenForUser(
    input: MailAccessTokenForUserInput,
  ): Promise<MailAccessTokenResult>;
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
