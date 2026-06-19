import {
  parseStalwartDefaultFolders,
  parseStalwartDuration,
  parseStalwartSizeBytes,
  STALWART_EMAIL_POLICY_PROPERTIES,
  STALWART_JMAP_POLICY_PROPERTIES,
  type MailServerPolicyConfig,
} from "@workspace/calendar-core";
import type { StalwartJmapAdminClientLike } from "./stalwart-admin";

export type StalwartMailServerLimitsConfig = MailServerPolicyConfig;

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function getStalwartMethodResult<T>(
  envelope: { methodResponses?: Array<[string, Record<string, unknown>, string]> },
  methodName: string,
): T {
  const match = envelope.methodResponses?.find(
    ([name]) => name === methodName,
  );
  if (!match) {
    throw new Error(`Stalwart JMAP response did not include ${methodName}.`);
  }
  return match[1] as T;
}

export async function fetchStalwartMailServerLimits(
  adminClient: StalwartJmapAdminClientLike,
): Promise<StalwartMailServerLimitsConfig> {
  const envelope = await adminClient.callJmap({
    using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
    methodCalls: [
      [
        "x:Email/get",
        {
          ids: ["singleton"],
          properties: [...STALWART_EMAIL_POLICY_PROPERTIES],
        },
        "email-limits",
      ],
      [
        "x:Jmap/get",
        {
          ids: ["singleton"],
          properties: [...STALWART_JMAP_POLICY_PROPERTIES],
        },
        "jmap-limits",
      ],
    ],
  });

  const emailResult = getStalwartMethodResult<{
    list?: Array<Record<string, unknown>>;
  }>(envelope, "x:Email/get");
  const jmapResult = getStalwartMethodResult<{
    list?: Array<Record<string, unknown>>;
  }>(envelope, "x:Jmap/get");

  const emailSettings = emailResult.list?.[0];
  const jmapSettings = jmapResult.list?.[0];
  const jmapUploadBytes = parseStalwartSizeBytes(jmapSettings?.maxUploadSize);
  const uploadTtlMs = parseStalwartDuration(jmapSettings?.uploadTtl);
  const emailMaxMailboxDepth = emailSettings?.maxMailboxDepth;
  const emailMaxMailboxNameLength = emailSettings?.maxMailboxNameLength;
  const emailMaxMailboxes = emailSettings?.maxMailboxes;
  const emailMaxIdentities = emailSettings?.maxIdentities;
  const emailDefaultFolders = emailSettings?.defaultFolders;
  const jmapGetMaxResults = jmapSettings?.getMaxResults;
  const jmapQueryMaxResults = jmapSettings?.queryMaxResults;
  const jmapMaxMethodCalls = jmapSettings?.maxMethodCalls;
  const jmapMaxConcurrentUploads = jmapSettings?.maxConcurrentUploads;
  const jmapMaxRequestSize = parseStalwartSizeBytes(jmapSettings?.maxRequestSize);

  return {
    ...(hasValue(jmapUploadBytes) ? { maxBlobUploadBytes: jmapUploadBytes } : {}),
    maxAttachmentSizeBytes: emailSettings
      ? parseStalwartSizeBytes(emailSettings.maxAttachmentSize)
      : null,
    maxMessageSizeBytes: emailSettings
      ? parseStalwartSizeBytes(emailSettings.maxMessageSize)
      : null,
    ...(hasValue(emailMaxMailboxDepth)
      ? { maxMailboxDepth: Number(emailMaxMailboxDepth) }
      : {}),
    ...(hasValue(emailMaxMailboxNameLength)
      ? { maxMailboxNameLength: Number(emailMaxMailboxNameLength) }
      : {}),
    ...(hasValue(emailMaxMailboxes)
      ? { maxMailboxes: Number(emailMaxMailboxes) }
      : {}),
    ...(hasValue(emailMaxIdentities)
      ? { maxIdentities: Number(emailMaxIdentities) }
      : {}),
    ...(hasValue(emailDefaultFolders)
      ? {
          defaultFolders: parseStalwartDefaultFolders(emailDefaultFolders),
        }
      : {}),
    ...(hasValue(jmapGetMaxResults)
      ? { getMaxResults: Number(jmapGetMaxResults) }
      : {}),
    ...(hasValue(jmapQueryMaxResults)
      ? { queryMaxResults: Number(jmapQueryMaxResults) }
      : {}),
    ...(hasValue(jmapMaxMethodCalls)
      ? { maxMethodCalls: Number(jmapMaxMethodCalls) }
      : {}),
    ...(hasValue(jmapMaxConcurrentUploads)
      ? { maxConcurrentUploads: Number(jmapMaxConcurrentUploads) }
      : {}),
    ...(hasValue(jmapMaxRequestSize)
      ? {
          maxRequestSizeBytes: jmapMaxRequestSize,
        }
      : {}),
    ...(hasValue(uploadTtlMs) ? { uploadTtlMs } : {}),
  };
}

export { getStalwartMethodResult };
