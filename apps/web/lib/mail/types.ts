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

export type MailAccountStatus = {
  email: string;
  displayName: string | null;
  provisioned: boolean;
};

export type MailSignupRequest = {
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

export type MailSignupResponse = {
  email: string;
  displayName: string | null;
  stalwartAccountId: string;
  stalwartPublicKeyId: string;
  fingerprint: string;
  encryptionAtRestEnabled: boolean;
};

export type MailBootstrapRequest = {
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

export type MailDirectoryKey = {
  email: string;
  publicKeyArmored: string;
  fingerprint: string;
  source: string;
  trust: string;
};

export type MailVaultBackupRecord = {
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type MailAddress = {
  email: string;
  name?: string | null;
};

export type JmapSession = {
  accounts: Record<string, { name?: string }>;
  primaryAccounts: Record<string, string>;
  apiUrl: string;
  downloadUrl?: string;
  uploadUrl?: string;
  eventSourceUrl?: string;
  username?: string;
  capabilities?: Record<string, unknown>;
};

export type JmapMailbox = {
  id: string;
  name: string;
  role?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};

export type JmapIdentity = {
  id: string;
  email: string;
  name?: string | null;
};

export type JmapBodyPartRef = {
  partId?: string;
};

export type JmapBodyValue = {
  value?: string;
  isTruncated?: boolean;
};

export type JmapBodyStructure = {
  type?: string;
  blobId?: string;
  name?: string;
  subParts?: JmapBodyStructure[];
};

export type JmapAttachment = {
  name?: string | null;
  type?: string | null;
};

export type JmapEmailMessage = {
  id: string;
  threadId?: string;
  mailboxIds?: Record<string, boolean>;
  subject?: string | null;
  from?: MailAddress[];
  to?: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  receivedAt?: string;
  keywords?: Record<string, boolean>;
  bodyStructure?: JmapBodyStructure;
  bodyValues?: Record<string, JmapBodyValue>;
  textBody?: JmapBodyPartRef[];
  htmlBody?: JmapBodyPartRef[];
  attachments?: JmapAttachment[];
};

export type MailRealtimeEvent = {
  type: "mail.changed";
  accountId: string;
  changedTypes: string[];
  receivedAt: string;
};

export type MailSyncThreadRecord = {
  id: string;
  emailIds: string[];
};

export type MailSyncCollection<T> = {
  oldState: string | null;
  newState: string;
  created: string[];
  updated: string[];
  destroyed: string[];
  records: T[];
};

export type MailSyncResponse = {
  accountId: string;
  initialized: boolean;
  changedTypes: string[];
  email: MailSyncCollection<JmapEmailMessage>;
  mailbox: MailSyncCollection<JmapMailbox>;
  thread: MailSyncCollection<MailSyncThreadRecord>;
};

export type MessageEncryptionState =
  | "plain"
  | "inline_pgp"
  | "pgp_mime"
  | "internal_e2ee"
  | "unknown_encrypted";

export type LabelDef = {
  id: string;
  name: string;
  color: string;
};

export type UserKeyVault = {
  userId: string;
  email: string;
  publicKeyArmored: string;
  publicKeyFingerprint: string;
  encryptedPrivateKeyArmored: string;
  kdf: "argon2id";
  kdfParams: MailVaultKdfParams;
  vaultVersion: number;
  createdAt: string;
  labels?: LabelDef[];
};

export type EncryptedMailVaultRecord = {
  encryptedVaultB64: string;
  kdf: "argon2id";
  kdfParams: MailVaultKdfParams;
};

export type GenerateKeyPairResult = {
  publicKeyArmored: string;
  privateKeyArmored: string;
  revocationCertificate: string;
  fingerprint: string;
};

export type MailSignatureVerificationState =
  | "not_signed"
  | "verified"
  | "unverified"
  | "failed";

export type MailDecryptResult = {
  plaintext: string;
  hasVerifiedSignature: boolean;
  signatureVerificationState: MailSignatureVerificationState;
};
