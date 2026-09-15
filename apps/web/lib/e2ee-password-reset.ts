import {
  decryptEntityName,
  encryptEventContentRequest,
  encryptNameRequest,
} from "@workspace/e2ee";
import type {
  EncryptedNameKind,
  EventWireRequest,
  NameWireRequest,
} from "@workspace/calendar-core";
import { e2eeApiService } from "./e2ee-api-service";
import {
  createBlindIndexTokens,
  createPasswordEnvelope,
  decryptJsonPayload,
  encryptJsonPayload,
  type EncryptedJsonPayload,
} from "./e2ee-crypto";
import { clearPendingAuthPassword } from "./e2ee-password-cache";
import { getActiveE2eeSession } from "./e2ee-session";
import { httpClient } from "./http-client";
import type {
  E2eeResetSnapshotCalendar,
  E2eeResetSnapshotCategory,
  E2eeResetSnapshotEvent,
  UpdateCalendarRequest,
  UpdateEventRequest,
} from "./types/calendar";

const DEFAULT_ENCRYPTION_KEY_VERSION = 1;
const contentEncrypter = { encryptJsonPayload, createBlindIndexTokens };
const contentDecrypter = { decryptJsonPayload };
const BATCH_SIZE = 8;

type EventSensitiveFields = {
  title: string;
  description: string | null;
  location: string | null;
};

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveSnapshotKeyVersion(snapshot: {
  calendars: Array<{ encryptionKeyVersion?: number }>;
  categories: Array<{ encryptionKeyVersion?: number }>;
  events: Array<{ encryptionKeyVersion?: number }>;
}): number {
  return Math.max(
    DEFAULT_ENCRYPTION_KEY_VERSION,
    ...snapshot.calendars.map(
      (calendar) =>
        calendar.encryptionKeyVersion ?? DEFAULT_ENCRYPTION_KEY_VERSION,
    ),
    ...snapshot.categories.map(
      (category) =>
        category.encryptionKeyVersion ?? DEFAULT_ENCRYPTION_KEY_VERSION,
    ),
    ...snapshot.events.map(
      (event) => event.encryptionKeyVersion ?? DEFAULT_ENCRYPTION_KEY_VERSION,
    ),
  );
}

async function runInBatches<T>(
  values: T[],
  worker: (value: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    await Promise.all(values.slice(index, index + BATCH_SIZE).map(worker));
  }
}

async function resolveEntityName(
  kind: EncryptedNameKind,
  record: E2eeResetSnapshotCalendar | E2eeResetSnapshotCategory,
  accountKey: CryptoKey,
): Promise<string> {
  const name =
    record.name.trim() ||
    (await decryptEntityName(contentDecrypter, { accountKey }, kind, record));

  if (!name) {
    throw new Error(`${kind} ${record.id} is missing a name.`);
  }

  return name;
}

async function buildNameUpdate(
  kind: EncryptedNameKind,
  record: E2eeResetSnapshotCalendar | E2eeResetSnapshotCategory,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
  keyVersion: number,
): Promise<NameWireRequest<UpdateCalendarRequest>> {
  const name = await resolveEntityName(kind, record, accountKey);
  const request = await encryptNameRequest<UpdateCalendarRequest>(
    contentEncrypter,
    { accountKey, blindIndexKey },
    kind,
    { name },
    keyVersion,
  );

  if (request.name !== undefined || !request.encryptedName) {
    throw new Error(`${kind} ${record.id} could not be encrypted.`);
  }

  return request;
}

async function resolveEventSensitiveFields(
  event: E2eeResetSnapshotEvent,
  accountKey: CryptoKey,
): Promise<EventSensitiveFields> {
  if (event.encryptionState === "encrypted") {
    if (!event.encryptedContent) {
      throw new Error(`Encrypted event ${event.id} is missing ciphertext.`);
    }

    const decrypted = await decryptJsonPayload<EventSensitiveFields>(
      accountKey,
      JSON.parse(event.encryptedContent) as EncryptedJsonPayload,
      `event-content:v${event.encryptionKeyVersion ?? DEFAULT_ENCRYPTION_KEY_VERSION}`,
    );
    const title = decrypted.title.trim();

    if (!title) {
      throw new Error(`Encrypted event ${event.id} is missing a title.`);
    }

    return {
      title,
      description: normalizeOptionalText(decrypted.description),
      location: normalizeOptionalText(decrypted.location),
    };
  }

  const title = event.title.trim();

  if (!title) {
    throw new Error(`Event ${event.id} is missing a title.`);
  }

  return {
    title,
    description: normalizeOptionalText(event.description),
    location: normalizeOptionalText(event.location),
  };
}

async function buildEventUpdate(
  event: E2eeResetSnapshotEvent,
  accountKey: CryptoKey,
  blindIndexKey: CryptoKey,
  keyVersion: number,
): Promise<EventWireRequest<UpdateEventRequest>> {
  const sensitiveFields = await resolveEventSensitiveFields(event, accountKey);
  const request = await encryptEventContentRequest<UpdateEventRequest>(
    contentEncrypter,
    { accountKey, blindIndexKey },
    {
      title: sensitiveFields.title,
      description: sensitiveFields.description ?? undefined,
      location: sensitiveFields.location ?? undefined,
    },
    keyVersion,
  );

  if (!request.encryptedContent) {
    throw new Error(`Event ${event.id} could not be encrypted.`);
  }

  return request;
}

export async function resetEncryptionPasswordForActiveSession(
  userId: string,
  password: string,
): Promise<boolean> {
  const session = getActiveE2eeSession();

  if (!session || session.userId !== userId) {
    return false;
  }

  const snapshot = await e2eeApiService.getResetSnapshot();
  const keyVersion = resolveSnapshotKeyVersion(snapshot);

  await runInBatches(snapshot.calendars, async (calendar) => {
    const request = await buildNameUpdate(
      "calendar",
      calendar,
      session.accountKey,
      session.blindIndexKey,
      keyVersion,
    );
    await httpClient.put(`/api/calendars/${calendar.id}`, request);
  });

  await runInBatches(snapshot.categories, async (category) => {
    const request = await buildNameUpdate(
      "category",
      category,
      session.accountKey,
      session.blindIndexKey,
      keyVersion,
    );
    await httpClient.put(`/api/categories/${category.id}`, request);
  });

  await runInBatches(snapshot.events, async (event) => {
    const request = await buildEventUpdate(
      event,
      session.accountKey,
      session.blindIndexKey,
      keyVersion,
    );
    await httpClient.put(`/api/events/${event.id}`, request);
  });

  const envelope = await createPasswordEnvelope(
    session.accountKey,
    session.blindIndexKey,
    password,
    keyVersion,
  );

  await e2eeApiService.upsertPasswordEnvelope(envelope);
  clearPendingAuthPassword();
  return true;
}
