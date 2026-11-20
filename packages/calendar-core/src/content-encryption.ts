import type { Schema } from "@workspace/api-contracts";
import { z } from "./zod";
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

/** A feed URL sealed before it was bound to its feed; it opens only until the account is marked bound. */
export const UNBOUND_SUBSCRIPTION_URL_AAD = "subscription-url:v1";

/** Binding a sealed feed URL to its subscription id stops the server from moving it onto another feed; the server keeps only `sealed:<id>`. */
export function subscriptionUrlAad(subscriptionId: string): string {
  return `subscription-url:v2:${subscriptionId}`;
}

/** `encryptionKeyVersion` of event content bound to its stored row id; version 1 is the unbound legacy format. */
export const BOUND_EVENT_CONTENT_VERSION = 2;

/** Binding to the stored row id stops the server from moving one event's ciphertext onto another event. */
export function eventContentAad(keyVersion: number, eventId: string): string {
  return keyVersion < BOUND_EVENT_CONTENT_VERSION
    ? `event-content:v${keyVersion}`
    : `event-content:v${keyVersion}:${eventId}`;
}

/** A row id the client proposes: it cannot collide with server cuids or `<id>_<instant>` occurrence ids. */
export const CLIENT_ENTITY_ID_PATTERN = /^[0-9a-f]{32}$/;

export function newClientEntityId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const EVENT_CONTENT_UNAVAILABLE_MESSAGE =
  "This event can't be opened on this device, so it can't be edited.";

export const EVENT_CONTENT_FIELDS = [
  "title",
  "description",
  "location",
  "color",
  "categoryId",
] as const;
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
