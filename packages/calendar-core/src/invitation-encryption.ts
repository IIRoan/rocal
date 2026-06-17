import type { CalendarEvent } from "./types";

export type InvitationImportEncryptionPayload = {
  externalId: string;
  encryptedContent: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
};

export function isImportedExternalInvitationEvent(
  event: Pick<CalendarEvent, "externalId" | "isSynced" | "subscriptionId">,
): boolean {
  return (
    Boolean(event.externalId?.trim()) &&
    !event.isSynced &&
    !event.subscriptionId
  );
}

export function shouldSealImportedInvitationEncryption(
  event: Pick<
    CalendarEvent,
    | "externalId"
    | "isSynced"
    | "subscriptionId"
    | "encryptionState"
    | "encryptedContent"
  >,
): boolean {
  if (!isImportedExternalInvitationEvent(event)) {
    return false;
  }

  if (event.encryptionState === "encrypted") {
    return false;
  }

  if (event.encryptedContent?.trim()) {
    return false;
  }

  return true;
}

export function indexInvitationImportEncryption(
  payloads: InvitationImportEncryptionPayload[] | undefined,
): Map<string, InvitationImportEncryptionPayload> {
  const map = new Map<string, InvitationImportEncryptionPayload>();
  for (const payload of payloads ?? []) {
    const externalId = payload.externalId.trim();
    if (!externalId || !payload.encryptedContent.trim()) {
      continue;
    }
    map.set(externalId, {
      ...payload,
      externalId,
      encryptedContent: payload.encryptedContent.trim(),
    });
  }
  return map;
}
