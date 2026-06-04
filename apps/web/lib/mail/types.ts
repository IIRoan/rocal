import type {
  MailAccountStatus as SharedMailAccountStatus,
  MailDemoConfig,
  MailDirectoryKey as SharedMailDirectoryKey,
  MailOAuthConfig,
  MailSignup as SharedMailSignup,
  MailVaultBackup as SharedMailVaultBackup,
  MailVaultKdfParams,
} from "@workspace/calendar-core";
import { z } from "zod";

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
  sync?: MailSyncResponse;
};

export type MailSyncThreadRecord = {
  id: string;
  emailIds: string[];
};

export type MailCalendarImportSummary = {
  messagesScanned: number;
  icsPartsFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: string[];
};

export type MailSyncCollection<T> = {
  oldState: string | null;
  newState: string;
  created: string[];
  updated: string[];
  destroyed: string[];
  records: T[];
};

export type JmapEmailChanges = {
  oldState: string;
  newState: string;
  hasMoreChanges?: boolean;
  created: string[];
  updated: string[];
  destroyed: string[];
};

export type MailSyncResponse = {
  accountId: string;
  initialized: boolean;
  changedTypes: string[];
  email: MailSyncCollection<JmapEmailMessage>;
  mailbox: MailSyncCollection<JmapMailbox>;
  thread: MailSyncCollection<MailSyncThreadRecord>;
  calendarImport?: MailCalendarImportSummary;
};

const mailAddressSchema = z.object({
  email: z.string(),
  name: z.string().nullable().optional(),
});

const jmapBodyPartRefSchema = z.object({
  partId: z.string().optional(),
});

const jmapBodyValueSchema = z.object({
  value: z.string().optional(),
  isTruncated: z.boolean().optional(),
});

const jmapBodyStructureSchema: z.ZodType<JmapBodyStructure> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    blobId: z.string().optional(),
    name: z.string().optional(),
    subParts: z.array(jmapBodyStructureSchema).optional(),
  }),
);

const jmapAttachmentSchema = z.object({
  blobId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
});

const jmapEmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  messageId: z.array(z.string()).optional(),
  inReplyTo: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  mailboxIds: z.record(z.boolean()).optional(),
  subject: z.string().nullable().optional(),
  from: z.array(mailAddressSchema).optional(),
  to: z.array(mailAddressSchema).optional(),
  cc: z.array(mailAddressSchema).optional(),
  bcc: z.array(mailAddressSchema).optional(),
  receivedAt: z.string().optional(),
  keywords: z.record(z.boolean()).optional(),
  bodyStructure: jmapBodyStructureSchema.optional(),
  bodyValues: z.record(jmapBodyValueSchema).optional(),
  textBody: z.array(jmapBodyPartRefSchema).optional(),
  htmlBody: z.array(jmapBodyPartRefSchema).optional(),
  attachments: z.array(jmapAttachmentSchema).optional(),
});

const jmapMailboxSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

const mailSyncThreadRecordSchema = z.object({
  id: z.string(),
  emailIds: z.array(z.string()),
});

const mailCalendarImportSummarySchema = z.object({
  messagesScanned: z.number(),
  icsPartsFound: z.number(),
  eventsCreated: z.number(),
  eventsUpdated: z.number(),
  eventsDeleted: z.number(),
  errors: z.array(z.string()),
});

const mailSyncCollectionSchema = <T extends z.ZodTypeAny>(recordSchema: T) =>
  z.object({
    oldState: z.string().nullable(),
    newState: z.string(),
    created: z.array(z.string()),
    updated: z.array(z.string()),
    destroyed: z.array(z.string()),
    records: z.array(recordSchema),
  });

const mailSyncResponseSchema = z.object({
  accountId: z.string(),
  initialized: z.boolean(),
  changedTypes: z.array(z.string()),
  email: mailSyncCollectionSchema(jmapEmailMessageSchema),
  mailbox: mailSyncCollectionSchema(jmapMailboxSchema),
  thread: mailSyncCollectionSchema(mailSyncThreadRecordSchema),
  calendarImport: mailCalendarImportSummarySchema.optional(),
});

const mailRealtimeEventSchema = z.object({
  type: z.literal("mail.changed"),
  accountId: z.string(),
  changedTypes: z.array(z.string()),
  receivedAt: z.string(),
  sync: mailSyncResponseSchema.optional(),
});

export function parseMailRealtimeEvent(value: unknown): MailRealtimeEvent {
  return mailRealtimeEventSchema.parse(value) as MailRealtimeEvent;
}

export type { MessageEncryptionState } from "@workspace/calendar-core";

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
