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
  hydrateEncryptedNameWithoutSession,
  withoutPlaintextEventContent,
  withoutPlaintextName,
} from "./payloads";

/** Platform-agnostic interface for E2EE operations; web and native each supply their own crypto backend. */
export interface E2eeProvider {
  /** Swaps title, description and location for ciphertext; throws instead of sending plaintext when no session is active. */
  attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(
    request: T,
  ): Promise<EventWireRequest<T>>;

  /** Swaps the calendar name for ciphertext; a rename throws when no session is active. */
  attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(
    request: T,
  ): Promise<NameWireRequest<T>>;

  /** Swaps the category name for ciphertext; a rename throws when no session is active. */
  attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(
    request: T,
  ): Promise<NameWireRequest<T>>;

  /** Returns a placeholder name when this device cannot decrypt it. */
  hydrateEncryptedCalendar(calendar: Calendar): Promise<Calendar>;

  hydrateEncryptedCategory(category: EventCategory): Promise<EventCategory>;

  /** Resolves once any pending bootstrap settles. */
  hasActiveSession(): Promise<boolean>;

  /** Decrypt a single encrypted event for display, or return a placeholder when no E2EE session is active. */
  hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent>;

  hydrateEncryptedEvents(events: CalendarEvent[]): Promise<CalendarEvent[]>;

  /** Blind index tokens for a search query; empty when no E2EE session is active. */
  createBlindIndexTokens(value: string): Promise<string[]>;

  /** Seals a JSON value with the account key; throws instead of sending plaintext when no session is active. */
  encryptJson(value: unknown, aad: string): Promise<string>;

  /** Opens a value `encryptJson` sealed; null without a session or when it does not open. */
  decryptJson(encrypted: string, aad: string): Promise<unknown>;

  /** A reminder's lead sealed for the iPhone extension; undefined without a session, so a stored one is kept. */
  encryptNotificationLead(
    eventId: string,
    minutesBefore: number,
  ): Promise<string | undefined>;
}

/** Pre-session provider: content-free writes pass, plaintext content throws instead of leaving the device. */
export class NoopE2eeProvider implements E2eeProvider {
  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T): Promise<EventWireRequest<T>> {
    return withoutPlaintextEventContent(request);
  }

  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return withoutPlaintextName(request);
  }

  async attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return withoutPlaintextName(request);
  }

  async hydrateEncryptedCalendar(calendar: Calendar): Promise<Calendar> {
    return hydrateEncryptedNameWithoutSession("calendar", calendar);
  }

  async hydrateEncryptedCategory(
    category: EventCategory,
  ): Promise<EventCategory> {
    return hydrateEncryptedNameWithoutSession("category", category);
  }

  async hasActiveSession(): Promise<boolean> {
    return false;
  }

  async hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent> {
    return event;
  }

  async hydrateEncryptedEvents(
    events: CalendarEvent[],
  ): Promise<CalendarEvent[]> {
    return events;
  }

  async createBlindIndexTokens(_value: string): Promise<string[]> {
    return [];
  }

  async encryptJson(_value: unknown, _aad: string): Promise<string> {
    throw new Error("Encrypted data is not unlocked on this device.");
  }

  async decryptJson(_encrypted: string, _aad: string): Promise<unknown> {
    return null;
  }

  async encryptNotificationLead(
    _eventId: string,
    _minutesBefore: number,
  ): Promise<string | undefined> {
    return undefined;
  }
}
