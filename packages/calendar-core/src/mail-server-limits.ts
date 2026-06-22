import { z } from "zod";

const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";

/** Stalwart default `maxUploadSize` / session `maxSizeUpload`. */
export const DEFAULT_MAX_BLOB_UPLOAD_BYTES = 50_000_000;

/** Stalwart default Email singleton `maxAttachmentSize`. */
export const DEFAULT_MAX_ATTACHMENT_BYTES = 50_000_000;

const jmapCoreCapabilitySchema = z.object({
  maxSizeUpload: z.number().int().positive().optional(),
});

export type JmapSessionLimitsSource = {
  capabilities?: Record<string, unknown>;
};

export type StalwartEmailSettingsSource = {
  maxAttachmentSize?: unknown;
  maxMessageSize?: unknown;
};

export type StalwartJmapSettingsSource = {
  maxUploadSize?: unknown;
};

export type MailServerLimits = {
  maxBlobUploadBytes: number;
  maxAttachmentSizeBytes: number | null;
  maxMessageSizeBytes: number | null;
  maxOutgoingAttachmentBytes: number;
};

export type MailServerLimitsSource = {
  session?: JmapSessionLimitsSource | null;
  emailSettings?: StalwartEmailSettingsSource | null;
  jmapSettings?: StalwartJmapSettingsSource | null;
  configLimits?: Partial<MailServerLimits> | null;
};

const SIZE_UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1_000,
  mb: 1_000_000,
  gb: 1_000_000_000,
  kib: 1024,
  mib: 1024 * 1024,
  gib: 1024 * 1024 * 1024,
};

export function parseStalwartSizeBytes(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unit = match[2] ?? "b";
  const multiplier = SIZE_UNIT_MULTIPLIERS[unit];
  if (!multiplier) {
    return null;
  }

  return Math.floor(amount * multiplier);
}

function resolveMaxBlobUploadBytes(source: MailServerLimitsSource): number {
  const sessionCore = source.session?.capabilities?.[JMAP_CORE_CAPABILITY];
  const parsedSession = jmapCoreCapabilitySchema.safeParse(sessionCore);
  if (parsedSession.success && parsedSession.data.maxSizeUpload) {
    return parsedSession.data.maxSizeUpload;
  }

  const jmapUpload = parseStalwartSizeBytes(source.jmapSettings?.maxUploadSize);
  if (jmapUpload) {
    return jmapUpload;
  }

  if (source.configLimits?.maxBlobUploadBytes) {
    return source.configLimits.maxBlobUploadBytes;
  }

  return DEFAULT_MAX_BLOB_UPLOAD_BYTES;
}

function hasBlobUploadLimitSource(source: MailServerLimitsSource): boolean {
  const sessionCore = source.session?.capabilities?.[JMAP_CORE_CAPABILITY];
  const parsedSession = jmapCoreCapabilitySchema.safeParse(sessionCore);
  return Boolean(
    (parsedSession.success && parsedSession.data.maxSizeUpload) ||
      parseStalwartSizeBytes(source.jmapSettings?.maxUploadSize) ||
      source.configLimits?.maxBlobUploadBytes,
  );
}

function resolveAttachmentSizeBytes(
  source: MailServerLimitsSource,
): number | null {
  const fromEmail = parseStalwartSizeBytes(
    source.emailSettings?.maxAttachmentSize,
  );
  if (fromEmail) {
    return fromEmail;
  }

  if (source.configLimits?.maxAttachmentSizeBytes) {
    return source.configLimits.maxAttachmentSizeBytes;
  }

  // When only blob-upload limits are known, attachment cap stays unknown so
  // maxOutgoingAttachmentBytes is not incorrectly capped below the upload limit.
  if (hasBlobUploadLimitSource(source)) {
    return null;
  }

  return DEFAULT_MAX_ATTACHMENT_BYTES;
}

function resolveMessageSizeBytes(source: MailServerLimitsSource): number | null {
  const fromEmail = parseStalwartSizeBytes(source.emailSettings?.maxMessageSize);
  if (fromEmail) {
    return fromEmail;
  }

  if (source.configLimits?.maxMessageSizeBytes) {
    return source.configLimits.maxMessageSizeBytes;
  }

  return null;
}

export function resolveMailServerLimits(
  source: MailServerLimitsSource = {},
): MailServerLimits {
  const maxBlobUploadBytes = resolveMaxBlobUploadBytes(source);
  const maxAttachmentSizeBytes = resolveAttachmentSizeBytes(source);
  const maxMessageSizeBytes = resolveMessageSizeBytes(source);

  const outgoingCandidates = [maxBlobUploadBytes];
  if (maxAttachmentSizeBytes) {
    outgoingCandidates.push(maxAttachmentSizeBytes);
  }

  return {
    maxBlobUploadBytes,
    maxAttachmentSizeBytes,
    maxMessageSizeBytes,
    maxOutgoingAttachmentBytes: Math.min(...outgoingCandidates),
  };
}

export function resolveMaxOutgoingAttachmentBytes(
  source: MailServerLimitsSource = {},
): number {
  return resolveMailServerLimits(source).maxOutgoingAttachmentBytes;
}

export function formatAttachmentByteLimit(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  if (mebibytes >= 1 && Math.abs(mebibytes - Math.round(mebibytes)) < 0.05) {
    return `${Math.round(mebibytes)} MB`;
  }

  const megabytes = bytes / 1_000_000;
  if (megabytes >= 1 && Math.abs(megabytes - Math.round(megabytes)) < 0.05) {
    return `${Math.round(megabytes)} MB`;
  }

  if (mebibytes >= 1) {
    return `${mebibytes.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** @deprecated Use DEFAULT_MAX_BLOB_UPLOAD_BYTES */
export const DEFAULT_MAX_OUTGOING_ATTACHMENT_BYTES = DEFAULT_MAX_BLOB_UPLOAD_BYTES;

/** @deprecated Use JmapSessionLimitsSource */
export type JmapSessionAttachmentLimitsSource = JmapSessionLimitsSource;
