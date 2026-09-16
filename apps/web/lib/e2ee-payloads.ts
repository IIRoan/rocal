import {
  encryptEventContentRequest,
  encryptNameRequest,
} from "@workspace/e2ee";
import type {
  EventWireRequest,
  NameWireRequest,
} from "@workspace/calendar-core";
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

const contentEncrypter = { encryptJsonPayload, createBlindIndexTokens };

export async function getEncryptionSession() {
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
>(request: T): Promise<NameWireRequest<T>> {
  const session = await getEncryptionSession();
  if (!session) {
    return request;
  }

  return encryptNameRequest(contentEncrypter, session, "calendar", request);
}

export async function attachCategoryEncryptionShadow<
  T extends CreateCategoryRequest | UpdateCategoryRequest,
>(request: T): Promise<NameWireRequest<T>> {
  const session = await getEncryptionSession();
  if (!session) {
    return request;
  }

  return encryptNameRequest(contentEncrypter, session, "category", request);
}

export async function attachEventEncryptionShadow<
  T extends CreateEventRequest | UpdateEventRequest,
>(request: T): Promise<EventWireRequest<T>> {
  const session = await getEncryptionSession();
  if (!session) {
    return request;
  }

  return encryptEventContentRequest(contentEncrypter, session, request);
}
