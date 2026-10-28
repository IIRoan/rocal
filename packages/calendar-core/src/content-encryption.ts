import type { Schema } from "@workspace/api-contracts";
import { z } from "zod";
import type {
  CreateCalendarRequest,
  CreateCategoryRequest,
  CreateEventRequest,
  EventContentEncryptionShadowRequest,
  NameEncryptionShadowRequest,
  UpdateCalendarRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types";

export const CONTENT_ENCRYPTION_KEY_VERSION = 1;

export type EncryptedNameKind = "calendar" | "category";

const ENCRYPTED_CALENDAR_NAME_PLACEHOLDER = "Encrypted calendar";
const ENCRYPTED_CATEGORY_NAME_PLACEHOLDER = "Encrypted category";

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

const EVENT_CONTENT_FIELDS = ["title", "description", "location"] as const;
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
export type EventInvitationContent = z.infer<typeof eventInvitationContentSchema> &
  Schema<"InvitationContent">;

/** Event create/update body after client-side encryption; plaintext content never leaves the device. */
export type EventWireRequest<T extends CreateEventRequest | UpdateEventRequest> =
  Omit<T, EventContentField> &
    EventContentEncryptionShadowRequest & {
      invitationContent?: EventInvitationContent;
    };

/** Calendar/category create/update body after client-side encryption; the plaintext name never leaves the device. */
export type NameWireRequest<
  T extends
    | CreateCalendarRequest
    | UpdateCalendarRequest
    | CreateCategoryRequest
    | UpdateCategoryRequest,
> = Omit<T, "name"> & NameEncryptionShadowRequest;
