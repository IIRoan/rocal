import {
  formatAttachmentByteLimit,
  parseStalwartSizeBytes,
  resolveMailServerLimits,
  type MailServerLimits,
  type MailServerLimitsSource,
} from "./mail-server-limits";

const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";

/** Stalwart Email singleton defaults. */
export const DEFAULT_MAX_MAILBOX_DEPTH = 10;
export const DEFAULT_MAX_MAILBOX_NAME_LENGTH = 255;
export const DEFAULT_MAX_MAILBOXES = 250;
export const DEFAULT_MAX_IDENTITIES = 20;

/** Stalwart Jmap singleton defaults. */
export const DEFAULT_JMAP_GET_MAX_RESULTS = 500;
export const DEFAULT_JMAP_QUERY_MAX_RESULTS = 5000;
export const DEFAULT_JMAP_MAX_METHOD_CALLS = 16;
export const DEFAULT_JMAP_MAX_CONCURRENT_UPLOADS = 4;
export const DEFAULT_JMAP_MAX_REQUEST_SIZE_BYTES = 10_000_000;
export const DEFAULT_JMAP_UPLOAD_TTL_MS = 60 * 60_000;

export const REQUIRED_DEFAULT_FOLDER_ROLES = [
  "inbox",
  "drafts",
  "sent",
  "trash",
] as const;

export const STALWART_EMAIL_POLICY_PROPERTIES = [
  "maxAttachmentSize",
  "maxMessageSize",
  "maxMailboxDepth",
  "maxMailboxNameLength",
  "maxMailboxes",
  "maxIdentities",
  "defaultFolders",
] as const;

export const STALWART_JMAP_POLICY_PROPERTIES = [
  "maxUploadSize",
  "getMaxResults",
  "queryMaxResults",
  "maxMethodCalls",
  "maxConcurrentUploads",
  "maxRequestSize",
  "uploadTtl",
] as const;

export type MailDefaultFolderConfig = {
  role: string;
  name: string;
  create: boolean;
  subscribe: boolean;
};

export type MailServerPolicyConfig = {
  maxBlobUploadBytes?: number;
  maxAttachmentSizeBytes?: number | null;
  maxMessageSizeBytes?: number | null;
  maxMailboxDepth?: number;
  maxMailboxNameLength?: number;
  maxMailboxes?: number;
  maxIdentities?: number;
  defaultFolders?: MailDefaultFolderConfig[] | null;
  getMaxResults?: number;
  queryMaxResults?: number;
  maxMethodCalls?: number;
  maxConcurrentUploads?: number;
  maxRequestSizeBytes?: number;
  uploadTtlMs?: number;
};

export type StalwartEmailPolicySource = {
  maxAttachmentSize?: unknown;
  maxMessageSize?: unknown;
  maxMailboxDepth?: unknown;
  maxMailboxNameLength?: unknown;
  maxMailboxes?: unknown;
  maxIdentities?: unknown;
  defaultFolders?: unknown;
};

export type StalwartJmapPolicySource = {
  maxUploadSize?: unknown;
  getMaxResults?: unknown;
  queryMaxResults?: unknown;
  maxMethodCalls?: unknown;
  maxConcurrentUploads?: unknown;
  maxRequestSize?: unknown;
  uploadTtl?: unknown;
};

export type MailServerPolicy = {
  limits: MailServerLimits;
  maxMailboxDepth: number;
  maxMailboxNameLength: number;
  maxMailboxes: number;
  maxIdentities: number;
  defaultFolders: MailDefaultFolderConfig[];
  getMaxResults: number;
  queryMaxResults: number;
  maxMethodCalls: number;
  maxConcurrentUploads: number;
  maxRequestSizeBytes: number;
  uploadTtlMs: number;
};

export type MailServerPolicySource = MailServerLimitsSource & {
  emailSettings?: StalwartEmailPolicySource | null;
  jmapSettings?: StalwartJmapPolicySource | null;
  configPolicy?: Partial<MailServerPolicyConfig> | null;
};

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const jmapSessionPolicySchema = {
  maxSizeRequest: (value: unknown) =>
    typeof value === "number" && value > 0 ? value : null,
  maxCallsInRequest: (value: unknown) =>
    typeof value === "number" && value > 0 ? value : null,
  maxConcurrentUpload: (value: unknown) =>
    typeof value === "number" && value > 0 ? value : null,
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export function parseStalwartDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([smhd])$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = DURATION_UNIT_MS[match[2]!];
  if (!unit || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.floor(amount * unit);
}

export function getBuiltinDefaultFolders(): MailDefaultFolderConfig[] {
  return [
    { role: "inbox", name: "Inbox", create: true, subscribe: true },
    { role: "drafts", name: "Drafts", create: true, subscribe: true },
    { role: "sent", name: "Sent", create: true, subscribe: true },
    { role: "trash", name: "Trash", create: true, subscribe: true },
  ];
}

export function parseStalwartDefaultFolders(
  value: unknown,
): MailDefaultFolderConfig[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getBuiltinDefaultFolders();
  }

  const entries: MailDefaultFolderConfig[] = [];
  for (const [role, config] of Object.entries(value as Record<string, unknown>)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      continue;
    }
    const folder = config as Record<string, unknown>;
    if (typeof folder.name !== "string" || !folder.name.trim()) {
      continue;
    }
    entries.push({
      role: role.toLowerCase(),
      name: folder.name.trim(),
      create: folder.create !== false,
      subscribe: folder.subscribe !== false,
    });
  }

  return entries.length > 0 ? entries : getBuiltinDefaultFolders();
}

function readSessionCoreCapability(
  source: MailServerPolicySource,
): Record<string, unknown> | null {
  const core = source.session?.capabilities?.[JMAP_CORE_CAPABILITY];
  return core && typeof core === "object" && !Array.isArray(core)
    ? (core as Record<string, unknown>)
    : null;
}

function resolvePositiveInt(
  candidates: Array<number | null | undefined>,
  fallback: number,
): number {
  for (const candidate of candidates) {
    if (candidate != null && candidate > 0) {
      return candidate;
    }
  }
  return fallback;
}

export function resolveMailServerPolicy(
  source: MailServerPolicySource = {},
): MailServerPolicy {
  const config = source.configPolicy ?? null;
  const sessionCore = readSessionCoreCapability(source);
  const email = source.emailSettings ?? null;
  const jmap = source.jmapSettings ?? null;

  const limits = resolveMailServerLimits({
    session: source.session,
    emailSettings: email,
    jmapSettings: jmap,
    configLimits: config ?? source.configLimits ?? null,
  });

  return {
    limits,
    maxMailboxDepth: resolvePositiveInt(
      [
        parsePositiveInt(email?.maxMailboxDepth),
        config?.maxMailboxDepth,
      ],
      DEFAULT_MAX_MAILBOX_DEPTH,
    ),
    maxMailboxNameLength: resolvePositiveInt(
      [
        parsePositiveInt(email?.maxMailboxNameLength),
        config?.maxMailboxNameLength,
      ],
      DEFAULT_MAX_MAILBOX_NAME_LENGTH,
    ),
    maxMailboxes: resolvePositiveInt(
      [parsePositiveInt(email?.maxMailboxes), config?.maxMailboxes],
      DEFAULT_MAX_MAILBOXES,
    ),
    maxIdentities: resolvePositiveInt(
      [parsePositiveInt(email?.maxIdentities), config?.maxIdentities],
      DEFAULT_MAX_IDENTITIES,
    ),
    defaultFolders:
      email?.defaultFolders != null
        ? parseStalwartDefaultFolders(email.defaultFolders)
        : config?.defaultFolders?.length
          ? config.defaultFolders
          : getBuiltinDefaultFolders(),
    getMaxResults: resolvePositiveInt(
      [parsePositiveInt(jmap?.getMaxResults), config?.getMaxResults],
      DEFAULT_JMAP_GET_MAX_RESULTS,
    ),
    queryMaxResults: resolvePositiveInt(
      [parsePositiveInt(jmap?.queryMaxResults), config?.queryMaxResults],
      DEFAULT_JMAP_QUERY_MAX_RESULTS,
    ),
    maxMethodCalls: resolvePositiveInt(
      [
        parsePositiveInt(jmap?.maxMethodCalls),
        sessionCore
          ? jmapSessionPolicySchema.maxCallsInRequest(
              sessionCore.maxCallsInRequest,
            )
          : null,
        config?.maxMethodCalls,
      ],
      DEFAULT_JMAP_MAX_METHOD_CALLS,
    ),
    maxConcurrentUploads: resolvePositiveInt(
      [
        parsePositiveInt(jmap?.maxConcurrentUploads),
        sessionCore
          ? jmapSessionPolicySchema.maxConcurrentUpload(
              sessionCore.maxConcurrentUpload,
            )
          : null,
        config?.maxConcurrentUploads,
      ],
      DEFAULT_JMAP_MAX_CONCURRENT_UPLOADS,
    ),
    maxRequestSizeBytes: resolvePositiveInt(
      [
        parseStalwartSizeBytes(jmap?.maxRequestSize),
        sessionCore
          ? jmapSessionPolicySchema.maxSizeRequest(sessionCore.maxSizeRequest)
          : null,
        config?.maxRequestSizeBytes,
      ],
      DEFAULT_JMAP_MAX_REQUEST_SIZE_BYTES,
    ),
    uploadTtlMs: resolvePositiveInt(
      [
        parseStalwartDuration(jmap?.uploadTtl),
        config?.uploadTtlMs,
      ],
      DEFAULT_JMAP_UPLOAD_TTL_MS,
    ),
  };
}

export function resolveMailboxMessagesPageSize(
  policy: Pick<MailServerPolicy, "getMaxResults">,
  preferred = 50,
): number {
  return Math.min(Math.max(1, preferred), policy.getMaxResults);
}

export function resolveMailboxSearchPageSize(
  policy: Pick<MailServerPolicy, "queryMaxResults" | "getMaxResults">,
  preferred = 40,
): number {
  return Math.min(
    Math.max(1, preferred),
    policy.getMaxResults,
    policy.queryMaxResults,
  );
}

export function resolveMailboxNameDepth(name: string): number {
  const trimmed = name.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split("/").filter(Boolean).length;
}

export function validateMailboxName(
  name: string,
  policy: Pick<MailServerPolicy, "maxMailboxNameLength" | "maxMailboxDepth">,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Mailbox name is required.";
  }
  if (trimmed.length > policy.maxMailboxNameLength) {
    return `Mailbox name must be ${policy.maxMailboxNameLength} characters or fewer.`;
  }
  const depth = resolveMailboxNameDepth(trimmed);
  if (depth > policy.maxMailboxDepth) {
    return `Mailbox path exceeds the maximum depth of ${policy.maxMailboxDepth}.`;
  }
  return null;
}

export function validateMailboxCreate(
  input: { name: string; existingMailboxCount: number },
  policy: Pick<
    MailServerPolicy,
    "maxMailboxes" | "maxMailboxNameLength" | "maxMailboxDepth"
  >,
): string | null {
  const nameError = validateMailboxName(input.name, policy);
  if (nameError) {
    return nameError;
  }
  if (input.existingMailboxCount >= policy.maxMailboxes) {
    return `You can create at most ${policy.maxMailboxes} mailboxes.`;
  }
  return null;
}

export function canCreateMailbox(
  existingMailboxCount: number,
  policy: Pick<MailServerPolicy, "maxMailboxes">,
): boolean {
  return existingMailboxCount < policy.maxMailboxes;
}

export function validateIdentityLimit(
  existingCount: number,
  policy: Pick<MailServerPolicy, "maxIdentities">,
): string | null {
  if (existingCount >= policy.maxIdentities) {
    return `This account supports at most ${policy.maxIdentities} identities.`;
  }
  return null;
}

export function getMissingDefaultFolderRoles(
  mailboxes: Array<{ role?: string | null }>,
  defaultFolders: MailDefaultFolderConfig[] = getBuiltinDefaultFolders(),
): MailDefaultFolderConfig[] {
  const presentRoles = new Set(
    mailboxes
      .map((mailbox) => mailbox.role?.toLowerCase() ?? "")
      .filter(Boolean),
  );

  return defaultFolders.filter(
    (folder) =>
      REQUIRED_DEFAULT_FOLDER_ROLES.includes(
        folder.role as (typeof REQUIRED_DEFAULT_FOLDER_ROLES)[number],
      ) && folder.create && !presentRoles.has(folder.role),
  );
}

export function capIdentitiesForPicker<T extends { id: string }>(
  identities: T[],
  policy: Pick<MailServerPolicy, "maxIdentities">,
): T[] {
  return identities.slice(0, policy.maxIdentities);
}

export function validateJmapRequestSize(
  approximateBytes: number,
  policy: Pick<MailServerPolicy, "maxRequestSizeBytes">,
): string | null {
  if (approximateBytes <= policy.maxRequestSizeBytes) {
    return null;
  }

  return `Message is too large to save (${formatAttachmentByteLimit(approximateBytes)}). The server limit is ${formatAttachmentByteLimit(policy.maxRequestSizeBytes)}.`;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, chunkSize);
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function runTasksWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, limit);
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]!();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

/** Conservative MIME / JMAP metadata overhead for outgoing size checks. */
const OUTGOING_MESSAGE_OVERHEAD_BYTES = 4_096;

export type OutgoingMessageSizeInput = {
  subject?: string;
  textBody: string;
  htmlBody?: string;
  attachments?: Array<{ size: number }>;
  pgpMimeCiphertext?: { size: number } | null;
};

export type JmapMethodCallLike = [string, Record<string, unknown>, string];

export type BlobUploadSource =
  | {
      kind: "bytes";
      content: Uint8Array;
      contentType: string;
      filename?: string;
    }
  | {
      kind: "text";
      text: string;
      contentType?: string;
    };

export type RegisteredBlobUpload = {
  blobId: string;
  size: number;
  type: string;
  name?: string;
  uploadedAt: number;
  source: BlobUploadSource;
};

export class MailBlobUploadRegistry {
  private readonly byBlobId = new Map<string, RegisteredBlobUpload>();

  register(upload: RegisteredBlobUpload): void {
    this.byBlobId.set(upload.blobId, upload);
  }

  get(blobId: string): RegisteredBlobUpload | undefined {
    return this.byBlobId.get(blobId);
  }

  replaceBlobId(
    oldBlobId: string,
    next: Pick<RegisteredBlobUpload, "blobId" | "size" | "uploadedAt">,
  ): void {
    const existing = this.byBlobId.get(oldBlobId);
    if (!existing) {
      return;
    }
    this.byBlobId.delete(oldBlobId);
    this.byBlobId.set(next.blobId, {
      ...existing,
      blobId: next.blobId,
      size: next.size,
      uploadedAt: next.uploadedAt,
    });
  }

  listRegistered(): RegisteredBlobUpload[] {
    return [...this.byBlobId.values()];
  }
}

export function isBlobUploadExpired(
  uploadedAt: number,
  uploadTtlMs: number,
  now: number = Date.now(),
): boolean {
  return uploadTtlMs > 0 && now - uploadedAt >= uploadTtlMs;
}

export function estimateOutgoingJmapMessageBytes(
  input: OutgoingMessageSizeInput,
): number {
  const subjectBytes = new TextEncoder().encode(input.subject ?? "").length;
  const attachmentBytes = (input.attachments ?? []).reduce(
    (sum, attachment) => sum + attachment.size,
    0,
  );

  if (input.pgpMimeCiphertext) {
    return (
      input.pgpMimeCiphertext.size +
      attachmentBytes +
      subjectBytes +
      OUTGOING_MESSAGE_OVERHEAD_BYTES
    );
  }

  const textBytes = new TextEncoder().encode(input.textBody).length;
  const htmlBytes = input.htmlBody
    ? new TextEncoder().encode(input.htmlBody).length
    : 0;

  return (
    Math.max(textBytes, htmlBytes) +
    attachmentBytes +
    subjectBytes +
    OUTGOING_MESSAGE_OVERHEAD_BYTES
  );
}

export function validateOutgoingMessageSize(
  estimatedBytes: number,
  maxMessageSizeBytes: number | null | undefined,
): string | null {
  if (maxMessageSizeBytes == null || estimatedBytes <= maxMessageSizeBytes) {
    return null;
  }

  return `Message exceeds the ${formatAttachmentByteLimit(maxMessageSizeBytes)} server limit.`;
}

function paramsReferenceOtherCalls(
  params: Record<string, unknown>,
  callIds: Set<string>,
): boolean {
  const serialized = JSON.stringify(params);
  if (serialized.includes("resultOf")) {
    return true;
  }

  for (const callId of callIds) {
    if (serialized.includes(`"#${callId}`) || serialized.includes(`"#${callId}"`)) {
      return true;
    }
  }

  return false;
}

export function jmapMethodCallsHaveDependencies(
  methodCalls: JmapMethodCallLike[],
): boolean {
  const callIds = new Set(methodCalls.map(([, , callId]) => callId));
  return methodCalls.some(([, params]) =>
    paramsReferenceOtherCalls(params, callIds),
  );
}

export function chunkJmapMethodCalls<T extends JmapMethodCallLike>(
  methodCalls: T[],
  maxMethodCalls: number,
): T[][] {
  const chunkSize = Math.max(1, maxMethodCalls);
  if (methodCalls.length <= chunkSize) {
    return [methodCalls];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < methodCalls.length; index += chunkSize) {
    chunks.push(methodCalls.slice(index, index + chunkSize));
  }
  return chunks;
}
