import type {
  UnifiedSearchEncryptionStatus,
  UnifiedSearchResult,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { JmapEmailMessage } from "@/lib/mail/types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";

const MAX_SNIPPET_LENGTH = 180;

type SearchField = {
  name: string;
  value: string;
  weight: number;
};

type ScoredDocument = {
  score: number;
  matchedFields: string[];
  snippet?: string;
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function createSnippet(value: string, queryTokens: string[]): string | undefined {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;

  const lower = compact.toLowerCase();
  const firstMatch = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return compact.length > MAX_SNIPPET_LENGTH
      ? `${compact.slice(0, MAX_SNIPPET_LENGTH - 1).trim()}…`
      : compact;
  }

  const start = Math.max(0, firstMatch - 48);
  const end = Math.min(compact.length, start + MAX_SNIPPET_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < compact.length ? "…" : "";

  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

function scoreFields(
  fields: SearchField[],
  query: string,
): ScoredDocument | null {
  const queryTokens = tokenizeSearchQuery(query);
  if (queryTokens.length === 0) return null;

  const normalizedPhrase = normalizeSearchText(query);
  const matchedFields = new Set<string>();
  let score = 0;
  let snippetSource = "";

  for (const field of fields) {
    const normalizedValue = normalizeSearchText(field.value);
    if (!normalizedValue) continue;

    const allTokensMatch = queryTokens.every((token) =>
      normalizedValue.includes(token),
    );
    const matchingTokenCount = queryTokens.filter((token) =>
      normalizedValue.includes(token),
    ).length;

    if (matchingTokenCount === 0) continue;

    matchedFields.add(field.name);
    score += matchingTokenCount * field.weight;

    if (allTokensMatch) score += field.weight;
    if (normalizedPhrase && normalizedValue.includes(normalizedPhrase)) {
      score += field.weight * 2;
    }

    if (!snippetSource || field.weight < 3) {
      snippetSource = field.value;
    }
  }

  if (score <= 0) return null;

  return {
    score,
    matchedFields: Array.from(matchedFields),
    snippet: createSnippet(snippetSource, queryTokens),
  };
}

function getMailFromLabel(message: JmapEmailMessage): string | undefined {
  const first = message.from?.[0];
  if (!first) return undefined;
  if (first.name && first.email) return `${first.name} <${first.email}>`;
  return first.name ?? first.email ?? undefined;
}

function getMailEncryptionStatus(
  message: JmapEmailMessage,
): UnifiedSearchEncryptionStatus {
  const state = classifyMessageEncryption(message);
  if (state === "plain") return "plaintext";
  if (state === "inline_pgp" || state === "pgp_mime") {
    return "metadata-only";
  }
  return "encrypted-locked";
}

export function searchMailMessages(
  messages: JmapEmailMessage[],
  query: string,
  limit: number,
): UnifiedSearchResult<JmapEmailMessage>[] {
  const results = messages.flatMap((message) => {
    const bodies = extractMessageBodies(message);
    const from = getMailFromLabel(message);
    const recipientText = [
      ...(message.to ?? []),
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
    ]
      .map((address) => `${address.name ?? ""} ${address.email ?? ""}`.trim())
      .join(" ");
    const attachmentText = (message.attachments ?? [])
      .map((attachment) => `${attachment.name ?? ""} ${attachment.type ?? ""}`)
      .join(" ");
    const scored = scoreFields(
      [
        { name: "subject", value: message.subject ?? "", weight: 8 },
        { name: "from", value: from ?? "", weight: 6 },
        { name: "to", value: recipientText, weight: 4 },
        { name: "body", value: bodies.text ?? bodies.html ?? "", weight: 2 },
        { name: "attachment", value: attachmentText, weight: 2 },
      ],
      query,
    );

    if (!scored) return [];

    const unreadBoost = message.keywords?.["$seen"] ? 0 : 0.4;
    const recencyBoost = message.receivedAt
      ? Math.max(
          0,
          1 -
            (Date.now() - new Date(message.receivedAt).getTime()) /
              (1000 * 60 * 60 * 24 * 180),
        )
      : 0;

    return [
      {
        id: `mail:${message.id}`,
        source: "mail" as const,
        messageId: message.id,
        threadId: message.threadId,
        mailboxIds: Object.keys(message.mailboxIds ?? {}),
        title: message.subject?.trim() || "(no subject)",
        snippet: scored.snippet,
        timestamp: message.receivedAt,
        score: scored.score + unreadBoost + recencyBoost,
        encryptionStatus: getMailEncryptionStatus(message),
        matchedFields: scored.matchedFields,
        from,
        message,
      },
    ];
  });

  return results.sort((left, right) => right.score - left.score).slice(0, limit);
}

export function toCalendarSearchResult(
  event: CalendarEvent,
  index: number,
): UnifiedSearchResult<JmapEmailMessage> {
  const encryptionStatus: UnifiedSearchEncryptionStatus =
    event.encryptionState === "encrypted"
      ? "encrypted-indexed"
      : event.encryptionState === "shadow_write"
        ? "metadata-only"
        : "plaintext";

  return {
    id: `calendar:${event.id}`,
    source: "calendar",
    eventId: event.id,
    title: event.title,
    snippet: event.location ?? event.description ?? undefined,
    timestamp:
      event.start instanceof Date
        ? event.start.toISOString()
        : new Date(event.start).toISOString(),
    score: 100 - index,
    encryptionStatus,
    matchedFields: ["calendar"],
    event,
  };
}
