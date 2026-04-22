import type {
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types/calendar";
import { waitForPendingE2eeBootstrap } from "./e2ee-bootstrap";
import { createBlindIndexTokens, encryptJsonPayload } from "./e2ee-crypto";
import { getActiveE2eeSession } from "./e2ee-session";

const NAME_ENCRYPTION_STATE = "shadow_write";
const EVENT_ENCRYPTION_STATE = "encrypted";
const ENCRYPTION_KEY_VERSION = 1;

function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function getEncryptionSession() {
  let session = getActiveE2eeSession();

  if (session) {
    return session;
  }

  const pendingBootstrap = waitForPendingE2eeBootstrap();
  if (pendingBootstrap) {
    await pendingBootstrap.catch(() => undefined);
    session = getActiveE2eeSession();
  }

  return session;
}

export async function attachCalendarEncryptionShadow<
  T extends CreateCalendarRequest | UpdateCalendarRequest,
>(request: T): Promise<T> {
  const session = await getEncryptionSession();
  const name = trimOptional(request.name);

  if (!session || !name) {
    return request;
  }

  const encryptedName = JSON.stringify(
    await encryptJsonPayload(
      session.accountKey,
      { name },
      `calendar-name:v${ENCRYPTION_KEY_VERSION}`,
    ),
  );
  const blindIndexTokens = await createBlindIndexTokens(
    session.blindIndexKey,
    name,
  );

  return {
    ...request,
    encryptedName,
    blindIndexTokens,
    encryptionState: NAME_ENCRYPTION_STATE,
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
  };
}

export async function attachCategoryEncryptionShadow<
  T extends CreateCategoryRequest | UpdateCategoryRequest,
>(request: T): Promise<T> {
  const session = await getEncryptionSession();
  const name = trimOptional(request.name);

  if (!session || !name) {
    return request;
  }

  const encryptedName = JSON.stringify(
    await encryptJsonPayload(
      session.accountKey,
      { name },
      `category-name:v${ENCRYPTION_KEY_VERSION}`,
    ),
  );
  const blindIndexTokens = await createBlindIndexTokens(
    session.blindIndexKey,
    name,
  );

  return {
    ...request,
    encryptedName,
    blindIndexTokens,
    encryptionState: NAME_ENCRYPTION_STATE,
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
  };
}

export async function attachEventEncryptionShadow<
  T extends CreateEventRequest | UpdateEventRequest,
>(request: T): Promise<T> {
  const session = await getEncryptionSession();
  const title = trimOptional(request.title);

  if (!session || !title) {
    return request;
  }

  const description = trimOptional(request.description);
  const location = trimOptional(request.location);
  const encryptedContent = JSON.stringify(
    await encryptJsonPayload(
      session.accountKey,
      {
        title,
        description: description ?? null,
        location: location ?? null,
      },
      `event-content:v${ENCRYPTION_KEY_VERSION}`,
    ),
  );
  const blindIndexTokens = await createBlindIndexTokens(
    session.blindIndexKey,
    [title, description, location].filter(Boolean).join(" "),
  );

  return {
    ...request,
    encryptedContent,
    blindIndexTokens,
    encryptionState: EVENT_ENCRYPTION_STATE,
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
  };
}