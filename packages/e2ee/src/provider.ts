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
import { hydrateEncryptedNameWithoutSession } from "./payloads";

/**
 * Platform-agnostic interface for E2EE operations.
 *
 * The CalendarApiService delegates all encryption/decryption to an
 * implementation of this interface so that web and native apps can each
 * provide their own crypto backend.
 */
export interface E2eeProvider {
  /** With an active session the body carries ciphertext only; plaintext content is removed. */
  attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(
    request: T,
  ): Promise<EventWireRequest<T>>;

  /** Encrypt a calendar name; the plaintext `name` is removed from the body. */
  attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(
    request: T,
  ): Promise<NameWireRequest<T>>;

  /** Encrypt a category name; the plaintext `name` is removed from the body. */
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

  /**
   * Decrypt a single encrypted event for display.
   * If no E2EE session is active, returns a placeholder event.
   */
  hydrateEncryptedEvent(event: CalendarEvent): Promise<CalendarEvent>;

  /**
   * Decrypt multiple encrypted events for display.
   */
  hydrateEncryptedEvents(events: CalendarEvent[]): Promise<CalendarEvent[]>;

  /**
   * Generate blind index tokens for a search query.
   * Returns an empty array if no E2EE session is active.
   */
  createBlindIndexTokens(value: string): Promise<string[]>;
}

/**
 * A no-op E2EE provider that passes data through unchanged.
 * Used when E2EE is not configured or not available.
 */
export class NoopE2eeProvider implements E2eeProvider {
  async attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(request: T): Promise<EventWireRequest<T>> {
    return request;
  }

  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return request;
  }

  async attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(request: T): Promise<NameWireRequest<T>> {
    return request;
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
}
