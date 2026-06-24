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
  textSignature?: string | null;
  htmlSignature?: string | null;
};

export type JmapBodyPartRef = {
  partId?: string;
  type?: string;
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
  disposition?: string | null;
  cid?: string | null;
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
  preview?: string | null;
  hasAttachment?: boolean;
  size?: number;
  bodyStructure?: JmapBodyStructure;
  bodyValues?: Record<string, JmapBodyValue>;
  textBody?: JmapBodyPartRef[];
  htmlBody?: JmapBodyPartRef[];
  attachments?: JmapAttachment[];
  /** JMAP header:* property — Authentication-Results header values */
  "header:Authentication-Results"?: string[] | null;
  /** JMAP header:* property — Received header values */
  "header:Received"?: string[] | null;
  /** JMAP header:* property — DKIM-Signature header values */
  "header:DKIM-Signature"?: string[] | null;
};

export type MailAuthResult = {
  spf: "pass" | "fail" | "none" | "unknown";
  dkim: "pass" | "fail" | "none" | "unknown";
  dmarc: "pass" | "fail" | "none" | "unknown";
};

/** JMAP header:* values are string arrays; some servers return a lone string. */
export function normalizeJmapHeaderValues(
  value: unknown,
): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export function parseAuthResults(
  headers: unknown,
): MailAuthResult {
  const result: MailAuthResult = {
    spf: "none",
    dkim: "none",
    dmarc: "none",
  };

  const normalized = normalizeJmapHeaderValues(headers);
  if (normalized.length === 0) return result;

  const combined = normalized.join("\n").toLowerCase();

  const spfMatch = combined.match(/spf\s*=\s*(pass|fail|none|softfail|neutral|temperror|permerror)/);
  if (spfMatch) {
    result.spf = spfMatch[1] === "softfail" || spfMatch[1] === "neutral" ? "fail" : spfMatch[1] as MailAuthResult["spf"];
  }

  const dkimMatch = combined.match(/dkim\s*=\s*(pass|fail|none|temperror|permerror)/);
  if (dkimMatch) {
    result.dkim = dkimMatch[1] as MailAuthResult["dkim"];
  }

  const dmarcMatch = combined.match(/dmarc\s*=\s*(pass|fail|none|bestguesspass|temperror|permerror)/);
  if (dmarcMatch) {
    result.dmarc = dmarcMatch[1] === "bestguesspass" ? "pass" : dmarcMatch[1] as MailAuthResult["dmarc"];
  }

  return result;
}

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

/** JMAP may send explicit null for absent optional fields. */
function jmapOptional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema);
}

const jmapHeaderValuesSchema = jmapOptional(
  z.preprocess(
    (value) => {
      const normalized = normalizeJmapHeaderValues(value);
      return normalized.length > 0 ? normalized : undefined;
    },
    z.array(z.string()),
  ),
);

const jmapBodyStructureSchema: z.ZodType<
  JmapBodyStructure,
  z.ZodTypeDef,
  unknown
> = z.lazy(() =>
  z.object({
    type: jmapOptional(z.string().optional()),
    blobId: jmapOptional(z.string().optional()),
    name: jmapOptional(z.string().optional()),
    subParts: jmapOptional(z.array(jmapBodyStructureSchema).optional()),
  }),
);

const jmapAttachmentSchema = z.object({
  blobId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
  disposition: z.string().nullable().optional(),
  cid: z.string().nullable().optional(),
});

const jmapEmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  messageId: z.array(z.string()).optional(),
  inReplyTo: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  mailboxIds: z.record(z.boolean()).optional(),
  subject: z.string().nullable().optional(),
  from: jmapOptional(z.array(mailAddressSchema).optional()),
  to: jmapOptional(z.array(mailAddressSchema).optional()),
  cc: jmapOptional(z.array(mailAddressSchema).optional()),
  bcc: jmapOptional(z.array(mailAddressSchema).optional()),
  receivedAt: z.string().optional(),
  keywords: z.record(z.boolean()).optional(),
  preview: z.string().nullable().optional(),
  hasAttachment: z.boolean().optional(),
  size: z.number().optional(),
  bodyStructure: jmapBodyStructureSchema.optional(),
  bodyValues: z.record(jmapBodyValueSchema).optional(),
  textBody: z.array(jmapBodyPartRefSchema).optional(),
  htmlBody: z.array(jmapBodyPartRefSchema).optional(),
  attachments: z.array(jmapAttachmentSchema).optional(),
  "header:Authentication-Results": jmapHeaderValuesSchema.optional(),
  "header:Received": jmapHeaderValuesSchema.optional(),
  "header:DKIM-Signature": jmapHeaderValuesSchema.optional(),
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
