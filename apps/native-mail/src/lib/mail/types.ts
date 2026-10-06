/** Native mail types: the web `lib/mail/types.ts` subset the native client needs, reusing calendar-core contracts. */
import type {
  MailAccountStatus as SharedMailAccountStatus,
  MailAuthResultsFields,
  MailSimpleLoginFields,
  MailDemoConfig as SharedMailDemoConfig,
  MailOAuthConfig as SharedMailOAuthConfig,
  MailSignup as SharedMailSignup,
  MailVaultKdfParams as SharedMailVaultKdfParams,
  MessageEncryptionState as SharedMessageEncryptionState,
} from "@workspace/calendar-core";

export type MailVaultKdfParams = SharedMailVaultKdfParams;
export type MailOAuthConfig = SharedMailOAuthConfig;
export type MailDemoConfig = SharedMailDemoConfig;
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
  wrappedSecret: string;
  wrapAlgorithm: string;
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
  textSignature?: string | null;
  htmlSignature?: string | null;
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

export type JmapAttachment = {
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
  content?: MailAttachmentContent | null;
};

export type JmapEmailMessage = MailSimpleLoginFields & MailAuthResultsFields & {
  id: string;
  threadId?: string;
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
  mailboxIds?: Record<string, boolean>;
  subject?: string | null;
  preview?: string | null;
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

export type JmapEmailPlacement = Pick<
  JmapEmailMessage,
  "id" | "mailboxIds" | "keywords"
>;

export type JmapEmailChanges = {
  oldState: string;
  newState: string;
  hasMoreChanges?: boolean;
  created: string[];
  updated: string[];
  destroyed: string[];
};

/** Plaintext, server-side encrypted-at-rest, or end-to-end PGP; re-exported from calendar-core. */
export type MessageEncryptionState = SharedMessageEncryptionState;

export type LabelDef = {
  id: string;
  name: string;
  color: string;
};
