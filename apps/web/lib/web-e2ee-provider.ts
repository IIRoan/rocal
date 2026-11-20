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
import { hydrateEncryptedName, openEncryptedEvent } from "@workspace/e2ee";
import {
  createBlindIndexTokens,
  decryptJsonPayload,
  encryptJsonPayload,
  parseEncryptedJsonPayload,
} from "./e2ee-crypto";
import { encryptReminderLead, encryptReminderTitle } from "./e2ee-notification-title";
import { getStoredE2eeDevice, markStoredEventContentBound } from "./e2ee-storage";
import {
  attachCalendarEncryptionShadow,
  attachCategoryEncryptionShadow,
  attachEventEncryptionShadow,
  getEncryptionSession as getE2eeSession,
} from "./e2ee-payloads";

const contentDecrypter = { decryptJsonPayload };

export class WebE2eeProvider implements E2eeProvider {
  private boundUsers = new Map<string, Promise<boolean>>();

  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T, eventId: string): Promise<EventWireRequest<T>> {
    return attachEventEncryptionShadow(request, eventId);
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

  private refusesUnboundContentFor(userId: string): Promise<boolean> {
    let bound = this.boundUsers.get(userId);
    if (!bound) {
      bound = getStoredE2eeDevice(userId).then(
        (record) => record?.eventContentBound === true,
        () => false,
      );
      this.boundUsers.set(userId, bound);
    }
    return bound;
  }

  async markEventContentBound(): Promise<void> {
    const session = await getE2eeSession();
    if (!session || (await this.refusesUnboundContentFor(session.userId))) return;
    this.boundUsers.set(session.userId, Promise.resolve(true));
    await markStoredEventContentBound(session.userId);
  }

  async refusesUnboundContent(): Promise<boolean> {
    const session = await getE2eeSession();
    return session ? this.refusesUnboundContentFor(session.userId) : false;
  }

  async hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent> {
    const session = event.encryptedContent ? await getE2eeSession() : null;
    return openEncryptedEvent(
      session ? contentDecrypter : null,
      session,
      event,
      session ? await this.refusesUnboundContentFor(session.userId) : false,
    );
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
  async encryptNotificationLead(
    eventId: string,
    minutesBefore: number,
  ): Promise<string | undefined> {
    return encryptReminderLead(eventId, minutesBefore);
  }

  async encryptNotificationTitle(
    eventId: string,
    title: string,
  ): Promise<string | undefined> {
    return (await encryptReminderTitle(eventId, title)) ?? undefined;
  }

}
