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

export type MailAccountStatus = SharedMailAccountStatus;

export type MailSignupResponse = SharedMailSignup;

export type MailBootstrapRequest = {
  publicKeyArmored: string;
  fingerprint: string;
  algorithm: string;
  createdAt: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

export type MailDirectoryKey = SharedMailDirectoryKey;

export type MailVaultBackupRecord = SharedMailVaultBackup;

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

export type MailAttachmentContent = ArrayBuffer | Uint8Array | string;

export type MailAttachment = {
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  content?: MailAttachmentContent | null;
};

export type JmapAttachment = Omit<MailAttachment, "content">;

export type JmapEmailMessage = {
  id: string;
  threadId?: string;
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
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
