import type {
  CalendarEvent,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateEventRequest,
  UpdateEventRequest,
} from "@workspace/calendar-core";

/**
 * Platform-agnostic interface for E2EE operations.
 *
 * The CalendarApiService delegates all encryption/decryption to an
 * implementation of this interface so that web and native apps can each
 * provide their own crypto backend.
 */
export interface E2eeProvider {
  /**
   * Attach encryption shadow fields to an event creation/update request.
   * Returns the request with encrypted content, blind index tokens, and
   * encryption state fields populated.
   */
  attachEventEncryptionShadow<
    T extends CreateEventRequest | UpdateEventRequest,
  >(
    request: T,
  ): Promise<T>;

  /**
   * Attach encryption shadow fields to a calendar creation/update request.
   */
  attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(
    request: T,
  ): Promise<T>;

  /**
   * Attach encryption shadow fields to a category creation/update request.
   */
  attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(
    request: T,
  ): Promise<T>;

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
  >(request: T): Promise<T> {
    return request;
  }

  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T): Promise<T> {
    return request;
  }

  async attachCategoryEncryptionShadow<
    T extends CreateCategoryRequest | UpdateCategoryRequest,
  >(request: T): Promise<T> {
    return request;
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
