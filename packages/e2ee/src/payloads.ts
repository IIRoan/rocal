import {
  CONTENT_ENCRYPTION_KEY_VERSION,
  encryptedNameAad,
  encryptedNamePlaceholder,
  eventContentAad,
  type CreateCalendarRequest,
  type CreateCategoryRequest,
  type CreateEventRequest,
  type EncryptedNameKind,
  type EventInvitationContent,
  type EventWireRequest,
  type NameWireRequest,
  type UpdateCalendarRequest,
  type UpdateCategoryRequest,
  type UpdateEventRequest,
} from "@workspace/calendar-core";
import type { E2eeModule, EncryptedJsonPayload } from "./e2ee-module";

export type ContentEncrypter = Pick<
  E2eeModule,
  "encryptJsonPayload" | "createBlindIndexTokens"
>;
export type ContentDecrypter = Pick<E2eeModule, "decryptJsonPayload">;

export interface E2eeSessionKeys {
  accountKey: CryptoKey;
  blindIndexKey: CryptoKey;
}

type NameRequest =
  | CreateCalendarRequest
  | UpdateCalendarRequest
  | CreateCategoryRequest
  | UpdateCategoryRequest;

export interface EncryptedNameRecord {
  name: string;
  encryptedName?: string | null;
  encryptionKeyVersion?: number;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Event ciphertext always covers title, description, and location together.
 * Requests without a title (time-only moves, visibility tweaks) carry no
 * content and are returned unchanged so the stored ciphertext is kept.
 */
export function shouldEncryptEventContent(request: object): boolean {
  if (!hasOwn(request, "title")) {
    return false;
  }

  return Boolean(trimToNull((request as { title?: string | null }).title));
}

/**
 * Encrypts event content and strips the plaintext fields from the request.
 * When the request invites attendees, a transient `invitationContent` copy is
 * attached because invitation mail goes to people who cannot decrypt it.
 */
export async function encryptEventContentRequest<
  T extends CreateEventRequest | UpdateEventRequest,
>(
  e2ee: ContentEncrypter,
  keys: E2eeSessionKeys,
  request: T,
  keyVersion: number = CONTENT_ENCRYPTION_KEY_VERSION,
): Promise<EventWireRequest<T>> {
  if (!shouldEncryptEventContent(request)) {
    return request;
  }

  const title = trimToNull(request.title) ?? "";
  const description = trimToNull(request.description);
  const location = trimToNull(request.location);

  const encryptedContent = JSON.stringify(
    await e2ee.encryptJsonPayload(
      keys.accountKey,
      { title, description, location },
      eventContentAad(keyVersion),
    ),
  );
  const blindIndexTokens = await e2ee.createBlindIndexTokens(
    keys.blindIndexKey,
    [title, description, location].filter(Boolean).join(" "),
  );

  const wire: EventWireRequest<T> = { ...request };
  delete wire.title;
  delete wire.description;
  delete wire.location;

  const invitesAttendees = (request.participants ?? []).some(
    (participant) => participant.role !== "organizer",
  );
  const invitationContent: EventInvitationContent | undefined =
    invitesAttendees
      ? {
          title,
          ...(description ? { description } : {}),
          ...(location ? { location } : {}),
        }
      : undefined;

  return {
    ...wire,
    encryptedContent,
    blindIndexTokens,
    encryptionKeyVersion: keyVersion,
    ...(invitationContent ? { invitationContent } : {}),
  };
}

/**
 * Encrypts a calendar/category name and strips the plaintext `name`. Requests
 * that do not rename (visibility, color) are returned unchanged.
 */
export async function encryptNameRequest<T extends NameRequest>(
  e2ee: ContentEncrypter,
  keys: E2eeSessionKeys,
  kind: EncryptedNameKind,
  request: T,
  keyVersion: number = CONTENT_ENCRYPTION_KEY_VERSION,
): Promise<NameWireRequest<T>> {
  const name = hasOwn(request, "name") ? trimToNull(request.name) : null;

  if (!name) {
    return request;
  }

  const encryptedName = JSON.stringify(
    await e2ee.encryptJsonPayload(
      keys.accountKey,
      { name },
      encryptedNameAad(kind, keyVersion),
    ),
  );
  const blindIndexTokens = await e2ee.createBlindIndexTokens(
    keys.blindIndexKey,
    name,
  );

  const wire: NameWireRequest<T> = { ...request };
  delete wire.name;
  delete wire.encryptionState;

  return {
    ...wire,
    encryptedName,
    blindIndexTokens,
    encryptionKeyVersion: keyVersion,
  };
}

export async function decryptEntityName(
  e2ee: ContentDecrypter,
  keys: Pick<E2eeSessionKeys, "accountKey">,
  kind: EncryptedNameKind,
  record: Pick<EncryptedNameRecord, "encryptedName" | "encryptionKeyVersion">,
): Promise<string | null> {
  if (!record.encryptedName) {
    return null;
  }

  try {
    const payload = JSON.parse(record.encryptedName) as EncryptedJsonPayload;
    const decrypted = await e2ee.decryptJsonPayload<{ name?: unknown }>(
      keys.accountKey,
      payload,
      encryptedNameAad(
        kind,
        record.encryptionKeyVersion ?? CONTENT_ENCRYPTION_KEY_VERSION,
      ),
    );
    return typeof decrypted.name === "string"
      ? trimToNull(decrypted.name)
      : null;
  } catch {
    return null;
  }
}

/** Placeholder for encrypted names this device cannot decrypt. */
export function hydrateEncryptedNameWithoutSession<
  T extends EncryptedNameRecord,
>(kind: EncryptedNameKind, record: T): T {
  if (!record.encryptedName) {
    return record;
  }

  return {
    ...record,
    name: trimToNull(record.name) ?? encryptedNamePlaceholder(kind),
  };
}

export async function hydrateEncryptedName<T extends EncryptedNameRecord>(
  e2ee: ContentDecrypter | null,
  keys: Pick<E2eeSessionKeys, "accountKey"> | null,
  kind: EncryptedNameKind,
  record: T,
): Promise<T> {
  if (!record.encryptedName) {
    return record;
  }

  const name = e2ee && keys ? await decryptEntityName(e2ee, keys, kind, record) : null;

  return name
    ? { ...record, name }
    : hydrateEncryptedNameWithoutSession(kind, record);
}
