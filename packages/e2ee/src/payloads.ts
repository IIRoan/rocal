import {
  BOUND_EVENT_CONTENT_VERSION,
  CONTENT_ENCRYPTION_KEY_VERSION,
  encryptedNameAad,
  encryptedNamePlaceholder,
  eventContentAad,
  findPlaintextEventContentFields,
  storedEventId,
  type CalendarEvent,
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
import {
  hydrateEncryptedEventWithoutSession,
  withDecryptedEventContent,
  type DecryptedEventContent,
} from "./hydration";

export type ContentEncrypter = Pick<E2eeModule, "encryptJsonPayload">;
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

export const ENCRYPTION_NOT_READY_MESSAGE =
  "Encryption is not ready on this device. Sign in again to unlock your encrypted data, then retry.";

/** Without a session only content-free writes (visibility, time moves) may leave the device. */
export function withoutPlaintextEventContent<
  T extends CreateEventRequest | UpdateEventRequest,
>(request: T): EventWireRequest<T> {
  if (findPlaintextEventContentFields(request).length > 0) {
    throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
  }
  const {
    title: _title,
    description: _description,
    location: _location,
    color: _color,
    categoryId: _categoryId,
    ...wire
  } = request;
  return wire;
}

/** Without a session only requests that do not rename may leave the device. */
export function withoutPlaintextName<T extends NameRequest>(
  request: T,
): NameWireRequest<T> {
  if (trimToNull(request.name)) {
    throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
  }
  const { name: _name, ...wire } = request;
  return wire;
}

/** Ciphertext covers every content field, so a request without a title must keep the stored one. */
export function shouldEncryptEventContent(request: object): boolean {
  if (!hasOwn(request, "title")) {
    return false;
  }

  return Boolean(trimToNull((request as { title?: string | null }).title));
}

/** Seals under the stored row id `eventId`; a transient `invitationContent` copy is attached because invitees cannot decrypt the ciphertext. */
export async function encryptEventContentRequest<
  T extends CreateEventRequest | UpdateEventRequest,
>(
  e2ee: ContentEncrypter,
  keys: E2eeSessionKeys,
  request: T,
  eventId: string,
  keyVersion: number = BOUND_EVENT_CONTENT_VERSION,
): Promise<EventWireRequest<T>> {
  if (!shouldEncryptEventContent(request)) {
    return withoutPlaintextEventContent(request);
  }

  const title = trimToNull(request.title) ?? "";
  const description = trimToNull(request.description);
  const location = trimToNull(request.location);
  const color = trimToNull(request.color);
  const categoryId = trimToNull(request.categoryId);

  const encryptedContent = JSON.stringify(
    await e2ee.encryptJsonPayload(
      keys.accountKey,
      { title, description, location, color, categoryId },
      eventContentAad(keyVersion, storedEventId(eventId)),
    ),
  );
  const {
    title: _title,
    description: _description,
    location: _location,
    color: _color,
    categoryId: _categoryId,
    ...wire
  } = request;

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
    encryptionKeyVersion: keyVersion,
    attributesEncrypted: true,
    ...(invitationContent ? { invitationContent } : {}),
  };
}

/** Opens an event's content under the AAD its stored version names; null when it does not open or is unbound and `refuseUnbound`. */
export async function decryptEventContent(
  e2ee: ContentDecrypter,
  keys: Pick<E2eeSessionKeys, "accountKey">,
  event: Pick<CalendarEvent, "id" | "encryptedContent" | "encryptionKeyVersion">,
  refuseUnbound: boolean,
): Promise<DecryptedEventContent | null> {
  const version = event.encryptionKeyVersion ?? CONTENT_ENCRYPTION_KEY_VERSION;
  const payload = event.encryptedContent
    ? parseEncryptedJsonPayload(event.encryptedContent)
    : null;
  if (!payload || (refuseUnbound && version < BOUND_EVENT_CONTENT_VERSION)) {
    return null;
  }
  return e2ee
    .decryptJsonPayload<DecryptedEventContent>(
      keys.accountKey,
      payload,
      eventContentAad(version, storedEventId(event.id)),
    )
    .catch(() => null);
}

/** An encrypted event opened for display, or a read-only placeholder when it does not open on this device. */
export async function openEncryptedEvent(
  e2ee: ContentDecrypter | null,
  keys: Pick<E2eeSessionKeys, "accountKey"> | null,
  event: CalendarEvent,
  refuseUnbound: boolean,
): Promise<CalendarEvent> {
  if (event.encryptionState !== "encrypted" || !event.encryptedContent) {
    return event;
  }
  const content =
    e2ee && keys ? await decryptEventContent(e2ee, keys, event, refuseUnbound) : null;
  return content
    ? withDecryptedEventContent(event, content)
    : hydrateEncryptedEventWithoutSession(event);
}

/** Requests that do not rename (visibility, color) carry no name on the wire. */
export async function encryptNameRequest<T extends NameRequest>(
  e2ee: ContentEncrypter,
  keys: E2eeSessionKeys,
  kind: EncryptedNameKind,
  request: T,
  keyVersion: number = CONTENT_ENCRYPTION_KEY_VERSION,
): Promise<NameWireRequest<T>> {
  const name = hasOwn(request, "name") ? trimToNull(request.name) : null;

  if (!name) {
    return withoutPlaintextName(request);
  }

  const encryptedName = JSON.stringify(
    await e2ee.encryptJsonPayload(
      keys.accountKey,
      { name },
      encryptedNameAad(kind, keyVersion),
    ),
  );
  const { name: _name, ...wire } = request;

  return {
    ...wire,
    encryptedName,
    encryptionKeyVersion: keyVersion,
  };
}

/** Wire shape of an encrypted name envelope; anything else is undecryptable. */
export function isEncryptedJsonPayload(value: unknown): value is EncryptedJsonPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.algorithm === "AES-GCM" &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.version === "number"
  );
}

/** Corrupt persisted envelopes remain undecryptable so callers can use their fallback. */
export function parseEncryptedJsonPayload(raw: string): EncryptedJsonPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEncryptedJsonPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    const parsed = parseEncryptedJsonPayload(record.encryptedName);
    if (!parsed) {
      return null;
    }

    const decrypted = await e2ee.decryptJsonPayload<{ name?: unknown }>(
      keys.accountKey,
      parsed,
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
