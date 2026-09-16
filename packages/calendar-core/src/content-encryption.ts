import { z } from "zod";
import type {
  Calendar,
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  EventCategory,
  EventContentEncryptionShadowRequest,
  NameEncryptionShadowRequest,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types";
import { isMailInvitationStagingCalendar } from "./mail-invitation-staging";

/** `"shadow_write"` is kept only to read responses from servers predating encrypted-only storage. */
export const E2EE_ROLLOUT_STAGE = "encrypted" as const;
export type E2eeRolloutStage = typeof E2EE_ROLLOUT_STAGE | "shadow_write";

export const CONTENT_ENCRYPTION_KEY_VERSION = 1;

export type EncryptedNameKind = "calendar" | "category";

export const ENCRYPTED_CALENDAR_NAME_PLACEHOLDER = "Encrypted calendar";
export const ENCRYPTED_CATEGORY_NAME_PLACEHOLDER = "Encrypted category";

/** Non-sensitive label used where a calendar name must leave the device (ICS, CalDAV). */
export const ENCRYPTED_CALENDAR_EXTERNAL_LABEL = "Solace calendar";

export function encryptedNamePlaceholder(kind: EncryptedNameKind): string {
  return kind === "calendar"
    ? ENCRYPTED_CALENDAR_NAME_PLACEHOLDER
    : ENCRYPTED_CATEGORY_NAME_PLACEHOLDER;
}

export function encryptedNameAad(
  kind: EncryptedNameKind,
  keyVersion: number = CONTENT_ENCRYPTION_KEY_VERSION,
): string {
  return `${kind}-name:v${keyVersion}`;
}

export function eventContentAad(
  keyVersion: number = CONTENT_ENCRYPTION_KEY_VERSION,
): string {
  return `event-content:v${keyVersion}`;
}

export const PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE =
  "Plaintext names must not be sent alongside an encrypted name.";
export const PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE =
  "Plaintext event content must not be sent alongside encrypted content.";

export const EVENT_CONTENT_FIELDS = ["title", "description", "location"] as const;
export type EventContentField = (typeof EVENT_CONTENT_FIELDS)[number];

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Event content fields that carry non-empty plaintext in a request body. */
export function findPlaintextEventContentFields(
  body: Partial<Record<EventContentField, unknown>>,
): EventContentField[] {
  return EVENT_CONTENT_FIELDS.filter((field) => hasText(body[field]));
}

export function hasEncryptedPayloadValue(value: unknown): value is string {
  return hasText(value);
}

/** Transient plaintext for invitation mail to non-Solace participants; the server never persists it. */
export const eventInvitationContentSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    location: z.string().max(255).optional(),
  })
  .strict();
export type EventInvitationContent = z.infer<typeof eventInvitationContentSchema>;

/** Event create/update body after client-side encryption. */
export type EventWireRequest<T extends CreateEventRequest | UpdateEventRequest> =
  Omit<T, EventContentField> &
    Partial<Pick<CreateEventRequest, EventContentField>> &
    EventContentEncryptionShadowRequest & {
      invitationContent?: EventInvitationContent;
    };

/** Calendar/category create/update body after client-side encryption. */
export type NameWireRequest<
  T extends
    | CreateCalendarRequest
    | UpdateCalendarRequest
    | CreateCategoryRequest
    | UpdateCategoryRequest,
> = Omit<T, "name"> & { name?: string } & NameEncryptionShadowRequest;

/** Subscription feed names and the invitation staging calendar stay plaintext by design. */
export function isCalendarNameBackfillCandidate(
  calendar: Pick<Calendar, "name" | "kind" | "isVisible" | "isSyncOnly">,
): boolean {
  return (
    calendar.kind === "owned" &&
    !calendar.isSyncOnly &&
    hasText(calendar.name) &&
    !isMailInvitationStagingCalendar(calendar)
  );
}

export function isCategoryNameBackfillCandidate(
  category: Pick<EventCategory, "name" | "isActive">,
): boolean {
  return category.isActive !== false && hasText(category.name);
}
