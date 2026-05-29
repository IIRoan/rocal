/**
 * Mail types for the native app.
 *
 * These mirror the web app's `lib/mail/types.ts` but contain only the
 * declarations the native client needs (no zod runtime schemas), re-using the
 * shared contract types from `@workspace/calendar-core` where available.
 */
import type {
  MailAccountStatus as SharedMailAccountStatus,
  MailDemoConfig as SharedMailDemoConfig,
  MailOAuthConfig as SharedMailOAuthConfig,
  MailVaultKdfParams as SharedMailVaultKdfParams,
  MessageEncryptionState as SharedMessageEncryptionState,
} from "@workspace/calendar-core";

export type MailVaultKdfParams = SharedMailVaultKdfParams;
export type MailOAuthConfig = SharedMailOAuthConfig;
export type MailDemoConfig = SharedMailDemoConfig;
export type MailAccountStatus = SharedMailAccountStatus;

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
  blobId?: string | null;
  name?: string | null;
  type?: string | null;
  size?: number | null;
};

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

export type JmapEmailChanges = {
  oldState: string;
  newState: string;
  hasMoreChanges?: boolean;
  created: string[];
  updated: string[];
  destroyed: string[];
};

/**
 * Whether a message is plaintext, server-side encrypted-at-rest, or end-to-end
 * (PGP) encrypted. Only `plain` messages can be rendered fully on-device; PGP
 * messages require the secure web client to decrypt.
 *
 * Re-exported from `@workspace/calendar-core` so web and native share one
 * canonical definition.
 */
export type MessageEncryptionState = SharedMessageEncryptionState;
