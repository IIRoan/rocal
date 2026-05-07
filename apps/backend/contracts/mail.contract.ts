export type MailVaultKdfParams = {
  saltB64: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
};

export type MailDemoConfig = {
  defaultDomain: string;
  discoveryBaseUrl: string;
  signupEnabled: boolean;
  loginMode: "basic";
};

export type MailAccountStatusResult = {
  email: string;
  displayName: string | null;
  provisioned: boolean;
};

export type MailSignupInput = {
  displayName?: string;
  localPart: string;
  password: string;
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
  createdAt: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type MailSignupResult = {
  email: string;
  displayName: string | null;
  stalwartAccountId: string;
  stalwartPublicKeyId: string;
  fingerprint: string;
  encryptionAtRestEnabled: boolean;
};

export type MailDirectoryKeyResult = {
  email: string;
  publicKeyArmored: string;
  fingerprint: string;
  source: string;
  trust: string;
};

export type MailVaultBackupResult = {
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type MailBootstrapForUserInput = {
  userId: string;
  email: string;
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

export type UpsertMailVaultBackupInput = {
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type UpsertMailVaultBackupForUserInput = {
  userId: string;
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export interface IMailService {
  getConfig(): MailDemoConfig;
  getMailboxStatusForUser(
    input: GetMailAccountStatusInput,
  ): Promise<MailAccountStatusResult>;
  signUp(input: MailSignupInput): Promise<MailSignupResult>;
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
}