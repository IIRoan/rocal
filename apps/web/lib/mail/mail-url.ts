import type { JmapMailbox } from "@/lib/mail/types";

export const MAIL_HOME_PATH = "/mail";

export const MAILBOX_QUERY_PARAM = "mbox";
export const MESSAGE_QUERY_PARAM = "msg";
export const LEGACY_MESSAGE_QUERY_PARAM = "messageId";

const KNOWN_MAILBOX_ROLE_SEGMENTS = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "archive",
  "spam",
  "junk",
  "flagged",
]);

type MailMessageTokenPayload = {
  v: 1;
  id: string;
  mid?: string;
};

export type MailUrlState = {
  mailboxSegment: string | null;
  messageId: string | null;
};

export type BuildMailUrlInput = {
  mailbox?: JmapMailbox | null;
  mailboxSegment?: string | null;
  messageId?: string | null;
  messageHeaderIds?: string[] | null;
};

function toUtf8Binary(value: string): string {
  return encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function fromUtf8Binary(binary: string): string {
  return decodeURIComponent(
    Array.from(binary, (char) =>
      `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
    ).join(""),
  );
}

function toBase64Url(value: string): string {
  return btoa(toUtf8Binary(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return fromUtf8Binary(atob(padded));
}

export function encodeMailMessageToken(
  messageId: string,
  messageHeaderIds?: string[] | null,
): string {
  const primaryHeader = messageHeaderIds
    ?.map((value) => value.trim())
    .find((value) => value.length > 0);

  const payload: MailMessageTokenPayload = primaryHeader
    ? { v: 1, id: messageId, mid: primaryHeader }
    : { v: 1, id: messageId };

  return toBase64Url(JSON.stringify(payload));
}

export function decodeMailMessageToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(trimmed)) as MailMessageTokenPayload;
    if (payload?.v === 1 && typeof payload.id === "string" && payload.id.trim()) {
      return payload.id.trim();
    }
  } catch {
    // Fall back to legacy raw tokens below.
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function encodeMailboxSegment(mailbox: JmapMailbox): string {
  const role = mailbox.role?.trim().toLowerCase();
  if (role && KNOWN_MAILBOX_ROLE_SEGMENTS.has(role)) {
    return role;
  }

  return encodeURIComponent(mailbox.id);
}

export function resolveMailboxFromSegment(
  segment: string,
  mailboxes: JmapMailbox[],
): JmapMailbox | null {
  const decoded = decodeURIComponent(segment);
  const normalized = decoded.toLowerCase();

  if (KNOWN_MAILBOX_ROLE_SEGMENTS.has(normalized)) {
    return (
      mailboxes.find((mailbox) => mailbox.role?.toLowerCase() === normalized) ??
      null
    );
  }

  return (
    mailboxes.find((mailbox) => mailbox.id === decoded) ??
    mailboxes.find((mailbox) => encodeURIComponent(mailbox.id) === segment) ??
    null
  );
}

function parseMailPathSegments(pathname: string | null | undefined): MailUrlState {
  if (!pathname?.startsWith(MAIL_HOME_PATH)) {
    return { mailboxSegment: null, messageId: null };
  }

  const rest = pathname.slice(MAIL_HOME_PATH.length).replace(/^\//, "");
  if (!rest) {
    return { mailboxSegment: null, messageId: null };
  }

  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { mailboxSegment: null, messageId: null };
  }

  if (parts.length === 1) {
    return { mailboxSegment: parts[0] ?? null, messageId: null };
  }

  const mailboxSegment = parts[0] ?? null;
  const messageToken = parts.slice(1).join("/");
  return {
    mailboxSegment,
    messageId: decodeMailMessageToken(messageToken),
  };
}

export function parseMailSearchParams(
  search: string | URLSearchParams,
): MailUrlState {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  const mailboxSegment = params.get(MAILBOX_QUERY_PARAM)?.trim() || null;
  const messageToken = params.get(MESSAGE_QUERY_PARAM)?.trim() || null;
  const legacyMessageId =
    params.get(LEGACY_MESSAGE_QUERY_PARAM)?.trim() || null;

  return {
    mailboxSegment,
    messageId:
      (messageToken ? decodeMailMessageToken(messageToken) : null) ??
      legacyMessageId,
  };
}

export function parseMailLocation(
  pathname: string | null | undefined,
  search: string | URLSearchParams,
): MailUrlState {
  const fromSearch = parseMailSearchParams(search);
  if (fromSearch.mailboxSegment || fromSearch.messageId) {
    return fromSearch;
  }

  return parseMailPathSegments(pathname);
}

export function buildMailSearchParams(input?: BuildMailUrlInput): URLSearchParams {
  const params = new URLSearchParams();
  const mailbox = input?.mailbox ?? null;
  const mailboxSegment =
    input?.mailboxSegment?.trim() ||
    (mailbox ? encodeMailboxSegment(mailbox) : null);
  const messageId = input?.messageId?.trim() || null;

  if (mailboxSegment) {
    params.set(MAILBOX_QUERY_PARAM, mailboxSegment);
  }

  if (messageId) {
    params.set(
      MESSAGE_QUERY_PARAM,
      encodeMailMessageToken(messageId, input?.messageHeaderIds),
    );
  }

  return params;
}

export function buildMailUrl(input?: BuildMailUrlInput): string {
  const params = buildMailSearchParams(input);
  const query = params.toString();
  return query ? `${MAIL_HOME_PATH}?${query}` : MAIL_HOME_PATH;
}

export function buildMailUrlFromIds(
  mailboxId: string | null | undefined,
  messageId: string,
  messageHeaderIds?: string[] | null,
): string {
  return buildMailUrl({
    mailboxSegment: mailboxId?.trim() || null,
    messageId,
    messageHeaderIds,
  });
}

export function locationsEqual(left: string, right: string): boolean {
  const leftUrl = new URL(left, "https://example.test");
  const rightUrl = new URL(right, "https://example.test");

  if (leftUrl.pathname !== rightUrl.pathname) {
    return false;
  }

  const leftRoute = parseMailSearchParams(leftUrl.search);
  const rightRoute = parseMailSearchParams(rightUrl.search);

  return (
    leftRoute.mailboxSegment === rightRoute.mailboxSegment &&
    leftRoute.messageId === rightRoute.messageId
  );
}

export function normalizeMailLocation(pathname: string, search: string): string {
  const state = parseMailLocation(pathname, search);
  const hasLegacyPath = parseMailPathSegments(pathname).mailboxSegment != null;
  const params = new URLSearchParams(search);
  const hasLegacyQuery = params.has(LEGACY_MESSAGE_QUERY_PARAM);

  if (!state.mailboxSegment && !state.messageId) {
    return MAIL_HOME_PATH;
  }

  if (hasLegacyPath || hasLegacyQuery) {
    return buildMailUrl({
      mailboxSegment: state.mailboxSegment,
      messageId: state.messageId,
    });
  }

  const trimmedSearch = search.trim().replace(/^\?/, "");
  return trimmedSearch ? `${MAIL_HOME_PATH}?${trimmedSearch}` : MAIL_HOME_PATH;
}

export function shouldClearMessageSelection(
  route: MailUrlState,
  selectedMessageId: string | null,
): boolean {
  return Boolean(route.mailboxSegment && !route.messageId && selectedMessageId);
}
