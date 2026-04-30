/**
 * Web-specific E2EE provider that wraps the existing web E2EE modules
 * to satisfy the platform-agnostic E2eeProvider interface from
 * @workspace/calendar-client.
 */
import type { E2eeProvider } from "@workspace/calendar-client";
import type {
  CalendarEvent,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateEventRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import { hydrateEncryptedEventWithoutSession, ENCRYPTED_EVENT_PLACEHOLDER_TITLE } from "@workspace/e2ee";
import { waitForPendingE2eeBootstrap } from "./e2ee-bootstrap";
import { createBlindIndexTokens, decryptJsonPayload } from "./e2ee-crypto";
import {
  attachCalendarEncryptionShadow,
  attachCategoryEncryptionShadow,
  attachEventEncryptionShadow,
} from "./e2ee-payloads";
import { getActiveE2eeSession } from "./e2ee-session";

async function getE2eeSession() {
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

export class WebE2eeProvider implements E2eeProvider {
  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T): Promise<T> {
    return attachEventEncryptionShadow(request);
  }

  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T): Promise<T> {
    return attachCalendarEncryptionShadow(request);
  }

  async attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(request: T): Promise<T> {
    return attachCategoryEncryptionShadow(request);
  }

  async hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent> {
    if (
      event.encryptionState !== "encrypted" ||
      !event.encryptedContent ||
      typeof event.encryptedContent !== "string"
    ) {
      return event;
    }

    const session = await getE2eeSession();
    if (!session) {
      return hydrateEncryptedEventWithoutSession(event);
    }

    try {
      const payload = JSON.parse(event.encryptedContent);
      const decrypted = await decryptJsonPayload<{
        title: string;
        description?: string | null;
        location?: string | null;
      }>(session.accountKey, payload, "event-content:v1");

      return {
        ...event,
        title:
          decrypted.title?.trim() ||
          event.title?.trim() ||
          ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
        description: decrypted.description ?? null,
        location: decrypted.location ?? null,
      };
    } catch {
      return hydrateEncryptedEventWithoutSession(event);
    }
  }

  async hydrateEncryptedEvents(
    events: CalendarEvent[],
  ): Promise<CalendarEvent[]> {
    return Promise.all(
      events.map((event) => this.hydrateEncryptedEvent(event)),
    );
  }

  async createBlindIndexTokens(value: string): Promise<string[]> {
    const session = await getE2eeSession();
    if (!session) {
      return [];
    }
    return createBlindIndexTokens(session.blindIndexKey, value);
  }
}
