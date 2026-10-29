/** Web E2EE modules wrapped for the platform-agnostic E2eeProvider interface from @workspace/calendar-client. */
import type { E2eeProvider } from "@workspace/calendar-client";
import type {
  Calendar,
  CalendarEvent,
  EventCategory,
  EventWireRequest,
  NameWireRequest,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateEventRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";
import {
  hydrateEncryptedEventWithoutSession,
  hydrateEncryptedName,
  withDecryptedEventContent,
  type DecryptedEventContent,
} from "@workspace/e2ee";
import {
  createBlindIndexTokens,
  decryptJsonPayload,
  encryptJsonPayload,
  parseEncryptedJsonPayload,
} from "./e2ee-crypto";
import {
  attachCalendarEncryptionShadow,
  attachCategoryEncryptionShadow,
  attachEventEncryptionShadow,
  getEncryptionSession as getE2eeSession,
} from "./e2ee-payloads";

const contentDecrypter = { decryptJsonPayload };

export class WebE2eeProvider implements E2eeProvider {
  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T): Promise<EventWireRequest<T>> {
    return attachEventEncryptionShadow(request);
  }

  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return attachCalendarEncryptionShadow(request);
  }

  async attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return attachCategoryEncryptionShadow(request);
  }

  async hydrateEncryptedCalendar(calendar: Calendar): Promise<Calendar> {
    const session = calendar.encryptedName ? await getE2eeSession() : null;
    return hydrateEncryptedName(
      session ? contentDecrypter : null,
      session,
      "calendar",
      calendar,
    );
  }

  async hydrateEncryptedCategory(
    category: EventCategory,
  ): Promise<EventCategory> {
    const session = category.encryptedName ? await getE2eeSession() : null;
    return hydrateEncryptedName(
      session ? contentDecrypter : null,
      session,
      "category",
      category,
    );
  }

  async hasActiveSession(): Promise<boolean> {
    return (await getE2eeSession()) !== null;
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
      const decrypted = await decryptJsonPayload<DecryptedEventContent>(
        session.accountKey,
        payload,
        "event-content:v1",
      );

      return withDecryptedEventContent(event, decrypted);
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

  async encryptJson(value: unknown, aad: string): Promise<string> {
    const session = await getE2eeSession();
    if (!session) {
      throw new Error("Encrypted data is not unlocked on this device.");
    }
    return JSON.stringify(await encryptJsonPayload(session.accountKey, value, aad));
  }

  async decryptJson(encrypted: string, aad: string): Promise<unknown> {
    const session = await getE2eeSession();
    const payload = parseEncryptedJsonPayload(encrypted);
    if (!session || !payload) {
      return null;
    }
    return decryptJsonPayload<unknown>(session.accountKey, payload, aad).catch(
      () => null,
    );
  }
}
