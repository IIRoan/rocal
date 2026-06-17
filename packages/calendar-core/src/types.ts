import type {
  CalendarShareLinkResponse,
  CalendarKind,
  CreateCalendarShareLinkRequest,
  CalendarSubscriptionSummary,
  CalendarSubscriptionSyncResponse,
  CreateCalendarSubscriptionRequest,
  DisableCalendarShareLinkResponse,
  DeleteCalendarSubscriptionResponse,
  ImportIcsRequest,
  ImportIcsResponse,
  UpdateCalendarSubscriptionRequest,
} from "@workspace/calendar-ics";
import type { RecurrenceRule as SharedRecurrenceRule } from "@workspace/calendar-ics/recurrence";

// ─── Calendar View Types ─────────────────────────────────────────────────────

/**
 * Calendar display modes. Defined here so calendar-core has no dependency
 * on the web-only @workspace/ui package.
 */
export type CalendarView = "month" | "week" | "3day" | "day" | "agenda";

export const CALENDAR_VIEWS: readonly CalendarView[] = [
  "month",
  "week",
  "3day",
  "day",
  "agenda",
];

/**
 * Number of days shown in the agenda view.
 */
export const AgendaDaysToShow = 30;

// ─── Event Search Types ──────────────────────────────────────────────────────

export interface EventSearchResult {
  events: CalendarEvent[];
  total: number;
}

export interface EventSearchCorpusResult {
  events: CalendarEvent[];
  total: number;
  nextOffset: number | null;
}

export interface EventSearchParams {
  q: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface EventSearchCorpusParams {
  limit?: number;
  offset?: number;
  updatedAfter?: string;
}

// ─── Core Calendar Types ─────────────────────────────────────────────────────

export type EventColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | "red"
  | "cyan"
  | "lime"
  | "amber"
  | "indigo"
  | "pink"
  | "teal"
  | string;

import type {
  EncryptionState,
  EventEncryptionMode,
  EventParticipantInput,
  EventParticipantRole,
  EventParticipantStatus,
} from "./route-schemas";

export type {
  EncryptionState,
  EventEncryptionMode,
  EventParticipantRole,
  EventParticipantStatus,
  EventParticipantInput,
} from "./route-schemas";

export interface NameEncryptionShadowRequest {
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
}

export interface EventContentEncryptionShadowRequest {
  encryptedContent?: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
}

export interface Calendar {
  id: string;
  name: string;
  encryptedName?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  forceFullEncryption?: boolean;
  color: EventColor;
  kind: CalendarKind;
  isPublic: boolean;
  isVisible: boolean;
  isDefault: boolean;
  isSyncOnly: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  encryptedContent?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  start: Date;
  end: Date;
  timezone?: string | null;
  allDay?: boolean;
  location?: string | null;
  color?: string | null;
  calendarId: string;
  calendar?: Calendar | null;
  categoryId?: string | null;
  category?: EventCategory | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  reminder?: number | null;
  recurrence?: string | null;
  parentEventId?: string | null;
  isCancelled?: boolean;
  isRecurringInstance?: boolean;
  isSynced?: boolean;
  externalId?: string | null;
  subscriptionId?: string | null;
  syncedAt?: Date | null;
  stalwartAccountId?: string | null;
  stalwartCalendarId?: string | null;
  stalwartEventId?: string | null;
  stalwartUid?: string | null;
  stalwartSyncedAt?: Date | null;
  participants?: EventParticipant[];
}

export interface EventParticipant {
  id: string;
  eventId: string;
  userId?: string | null;
  email: string;
  displayName?: string | null;
  image?: string | null;
  role: EventParticipantRole;
  status: EventParticipantStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export function getCurrentUserInvitationStatus(
  event: Pick<CalendarEvent, "userId" | "participants">,
): EventParticipantStatus | null {
  const participant = event.participants?.find(
    (entry) => entry.userId === event.userId && entry.role !== "organizer",
  );

  return participant?.status ?? null;
}

export function isAwaitingUserInvitationResponse(
  event: Pick<CalendarEvent, "userId" | "participants">,
): boolean {
  const status = getCurrentUserInvitationStatus(event);
  return status === "pending" || status === "tentative";
}

export function isUserDeclinedInvitationEvent(
  event: Pick<CalendarEvent, "userId" | "participants">,
): boolean {
  return getCurrentUserInvitationStatus(event) === "declined";
}

export function canCurrentUserEditEvent(
  event: Pick<CalendarEvent, "userId" | "participants">,
): boolean {
  const participant = event.participants?.find(
    (entry) => entry.userId === event.userId,
  );

  if (!participant) {
    return true;
  }

  return participant.role === "organizer";
}

export function canCurrentUserDeleteEvent(
  event: Pick<
    CalendarEvent,
    "isSynced" | "isCancelled" | "externalId" | "participants" | "userId"
  >,
): boolean {
  if (event.isSynced === true) {
    return false;
  }

  if (isAttendeeImportedInvitationEvent(event)) {
    if (isCancelledCalendarEvent(event)) {
      return true;
    }

    return getCurrentUserInvitationStatus(event) === "accepted";
  }

  return true;
}

export function invitationByExternalIdQueryKey(externalId: string) {
  return ["invitations", "by-external-id", externalId] as const;
}

export function isAttendeeImportedInvitationEvent(
  event: Pick<CalendarEvent, "externalId" | "participants" | "userId">,
): boolean {
  return (
    Boolean(event.externalId?.trim()) &&
    !canCurrentUserEditEvent(event)
  );
}

export function isCancelledCalendarEvent(
  event: Pick<CalendarEvent, "isCancelled">,
): boolean {
  return event.isCancelled === true;
}

export interface EventCategory {
  id: string;
  name: string;
  encryptedName?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  color: string;
  isActive: boolean;
  userId: string;
  usageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface EventsResponse {
  events: CalendarEvent[];
  categories: EventCategory[];
  calendars: Calendar[];
}

export interface CalendarsResponse {
  calendars: Calendar[];
}

export interface CategoriesResponse {
  categories: EventCategory[];
}

export interface CreateEventRequest extends EventContentEncryptionShadowRequest {
  title: string;
  description?: string;
  start: string;
  end: string;
  timezone?: string;
  allDay?: boolean;
  location?: string;
  color?: EventColor;
  calendarId: string;
  categoryId?: string;
  reminder?: number;
  recurrence?: string;
  participants?: EventParticipantInput[];
}

export interface CreateCalendarRequest extends NameEncryptionShadowRequest {
  name: string;
  color: EventColor;
  isDefault?: boolean;
  forceFullEncryption?: boolean;
}

export interface UpdateCalendarRequest extends Partial<CreateCalendarRequest> {
  isVisible?: boolean;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {
  id?: string;
}

export interface CreateCategoryRequest extends NameEncryptionShadowRequest {
  name: string;
  color: EventColor;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
  id?: string;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
  deletedEventId?: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

/** Type guard for API errors thrown by the calendar HTTP client. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiError).statusCode === "number" &&
    typeof (value as ApiError).message === "string"
  );
}

// ─── User Settings Types ─────────────────────────────────────────────────────

export interface UserSettings {
  id: string;
  userId: string;
  theme: "light" | "dark" | "system";
  defaultView: CalendarView;
  weekStartDay: number;
  timezone: string;
  timeFormat: "12h" | "24h";
  workingHoursStart: number;
  workingHoursEnd: number;
  workingDays: string;
  emailNotifications: boolean;
  browserNotifications: boolean;
  reminderSound: boolean;
  eventEncryptionMode: EventEncryptionMode;
  defaultEventDuration: number;
  defaultCalendarId?: string | null;
  compactView: boolean;
  showWeekNumbers: boolean;
  showDeclinedEvents: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSettingsRequest extends Partial<
  Omit<UserSettings, "id" | "userId" | "createdAt" | "updatedAt">
> {
  userId?: string;
}

// ─── Recurring Events Types ──────────────────────────────────────────────────

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = SharedRecurrenceRule;

export interface RecurrencePreview {
  instances: Array<{
    date: string;
    isOriginal: boolean;
  }>;
  description: string;
  totalInstances: number;
}

export interface RecurrenceValidation {
  valid: boolean;
  errors: string[];
  description?: string;
  rule?: RecurrenceRule;
}

export interface RecurrencePatterns {
  [key: string]: {
    rule: RecurrenceRule;
    description: string;
  };
}

export type RecurrenceEditScope = "this_only" | "this_and_future" | "all";
export type RecurrenceDeleteScope = "this_only" | "this_and_future" | "all";

export interface EditRecurringEventRequest {
  editScope: RecurrenceEditScope;
  occurrenceDate?: string;
  updates: UpdateEventRequest;
}

export interface DeleteRecurringEventRequest {
  deleteScope: RecurrenceDeleteScope;
  occurrenceDate?: string;
}

// ─── Calendar Deletion Types ─────────────────────────────────────────────────

export type CalendarDeleteAction = "delete_events" | "move_events";

export interface DeleteCalendarRequest {
  action?: CalendarDeleteAction;
  targetCalendarId?: string;
}

export interface CalendarDeleteResponse {
  success: boolean;
  message: string;
  deletedCalendarId: string;
  eventsAffected: number;
  action: string;
}

// ─── Bulk Operations Types ───────────────────────────────────────────────────

export type BulkEventAction = "move" | "delete" | "duplicate";

export interface BulkEventRequest {
  action: BulkEventAction;
  eventIds: string[];
  targetCalendarId?: string;
}

export interface BulkEventResponse {
  success: boolean;
  message: string;
  eventsProcessed: number;
  action: string;
  createdEvents?: CalendarEvent[];
}

// ─── Event Notification Types ────────────────────────────────────────────────

export interface EventNotification {
  id?: string;
  eventId?: string;
  notificationType: "browser" | "email";
  minutesBefore: number;
  isEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateNotificationRequest {
  notifications: Array<{
    notificationType: "browser" | "email";
    minutesBefore: number;
    isEnabled: boolean;
  }>;
}

export interface NotificationTestRequest {
  eventId: string;
}

export interface NotificationStatus {
  status: string;
  message: string;
  features: {
    email: boolean;
    browser: boolean;
    reminders: boolean;
  };
  checkInterval: string;
  queueProcessInterval: string;
}

// ─── ICS and Subscription API Types ──────────────────────────────────────────

export type CalendarSubscription = CalendarSubscriptionSummary;
export type CreateSubscriptionRequest = CreateCalendarSubscriptionRequest;
export type UpdateSubscriptionRequest = UpdateCalendarSubscriptionRequest;
export type DeleteSubscriptionResponse = DeleteCalendarSubscriptionResponse;
export type SyncSubscriptionResponse = CalendarSubscriptionSyncResponse;
export type ImportICSRequest = ImportIcsRequest;
export type ImportICSResponse = ImportIcsResponse;
export type CalendarShareLink = CalendarShareLinkResponse;
export type CreateCalendarShareLinkRequestPayload =
  CreateCalendarShareLinkRequest;
export type DisableCalendarShareLinkResponsePayload =
  DisableCalendarShareLinkResponse;

// ─── E2EE Types ──────────────────────────────────────────────────────────────

export interface E2eeDeviceRecord {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  publicKey: string;
  publicKeyAlgorithm: string;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eePasswordRecord {
  id: string;
  userId: string;
  kdfAlgorithm: string;
  kdfSalt: string;
  kdfIterations: number;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eeBootstrapCalendar {
  id: string;
  name: string;
  encryptedName: string | null;
  blindIndexTokens: string[];
  encryptionState: EncryptionState;
  encryptionKeyVersion: number;
  color: EventColor;
  kind: CalendarKind;
  isDefault: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eeBootstrapResponse {
  enabled: boolean;
  rolloutStage: "shadow_write";
  algorithms: {
    content: "AES-GCM-256";
    blindIndex: "HMAC-SHA-256";
    wrapping: string;
    passwordWrapping: string;
  };
  devices: E2eeDeviceRecord[];
  passwordEnvelope: E2eePasswordRecord | null;
  calendars: E2eeBootstrapCalendar[];
}

export interface E2eeResetSnapshotCalendar {
  id: string;
  name: string;
  encryptedName?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  color: EventColor;
  kind: CalendarKind;
  isDefault: boolean;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eeResetSnapshotCategory {
  id: string;
  name: string;
  encryptedName?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eeResetSnapshotEvent {
  id: string;
  title: string;
  description?: string | null;
  encryptedContent?: string | null;
  blindIndexTokens?: string[] | null;
  encryptionState?: EncryptionState;
  encryptionKeyVersion?: number;
  start: Date;
  end: Date;
  timezone?: string | null;
  allDay: boolean;
  location?: string | null;
  color?: string | null;
  calendarId: string;
  categoryId?: string | null;
  reminder?: number | null;
  recurrence?: string | null;
  parentEventId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface E2eeResetSnapshotResponse {
  calendars: E2eeResetSnapshotCalendar[];
  categories: E2eeResetSnapshotCategory[];
  events: E2eeResetSnapshotEvent[];
}

export interface UpsertE2eeDeviceRequest {
  deviceId: string;
  deviceLabel?: string;
  publicKey: string;
  publicKeyAlgorithm?: string;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm?: string;
  keyVersion?: number;
}

export interface UpsertE2eePasswordRequest {
  kdfAlgorithm?: string;
  kdfSalt: string;
  kdfIterations?: number;
  wrappedAccountKey: string;
  wrappedSearchKey: string;
  wrapAlgorithm?: string;
  keyVersion?: number;
}
