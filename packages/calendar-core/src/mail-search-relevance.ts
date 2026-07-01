const MAX_SNIPPET_LENGTH = 180;

type SearchField = {
  name: string;
  value: string;
  weight: number;
};

export type MailSearchScorableMessage = {
  id: string;
  subject?: string | null;
  from?: Array<{ name?: string | null; email?: string | null }> | null;
  to?: Array<{ name?: string | null; email?: string | null }> | null;
  cc?: Array<{ name?: string | null; email?: string | null }> | null;
  bcc?: Array<{ name?: string | null; email?: string | null }> | null;
  attachments?: Array<{ name?: string | null; type?: string | null }> | null;
  receivedAt?: string | null;
  keywords?: Record<string, boolean> | null;
  bodyValues?: Record<string, { value?: string | null }> | null;
  textBody?: Array<{ partId?: string }> | null;
  htmlBody?: Array<{ partId?: string }> | null;
};

export type MailSearchScore = {
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

function getBodyValue(
  bodyValues: MailSearchScorableMessage["bodyValues"],
  partId: string | undefined,
): string | null {
  if (!bodyValues || !partId) return null;
  const value = bodyValues[partId]?.value;
  return typeof value === "string" ? value : null;
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchableBody(message: MailSearchScorableMessage): string {
  const textPartId = message.textBody?.[0]?.partId;
  const htmlPartId = message.htmlBody?.[0]?.partId;
  const text = getBodyValue(message.bodyValues, textPartId);
  const html = getBodyValue(message.bodyValues, htmlPartId);

  if (text) return text;
  if (html) return stripHtmlTags(html);

  const firstValue = Object.values(message.bodyValues ?? {}).find(
    (entry) => typeof entry.value === "string" && entry.value.length > 0,
  )?.value;

  if (!firstValue) return "";
  if (firstValue.includes("<") && firstValue.includes(">")) {
    return stripHtmlTags(firstValue);
  }
  return firstValue;
}

function getMailFromLabel(message: MailSearchScorableMessage): string {
  const first = message.from?.[0];
  if (!first) return "";
  if (first.name && first.email) return `${first.name} <${first.email}>`;
  return first.name ?? first.email ?? "";
}

function formatRecipientText(
  addresses:
    | Array<{ name?: string | null; email?: string | null }>
    | null
    | undefined,
): string {
  return (addresses ?? [])
    .map((address) => `${address.name ?? ""} ${address.email ?? ""}`.trim())
    .join(" ");
}

function createSnippet(
  value: string,
  queryTokens: string[],
): string | undefined {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenMatchesInText(normalizedValue: string, token: string): boolean {
  if (!token) return false;
  const pattern = new RegExp(
    `(?:^|[\\s@._+-])${escapeRegExp(token)}(?:$|[\\s@._+-])`,
    "u",
  );
  return pattern.test(` ${normalizedValue} `);
}

/**
 * Prefix and fuzzy matches contribute less score than exact matches so a
 * partial or typo-tolerant result still ranks below an exact match for the
 * same query.
 */
const PREFIX_MATCH_WEIGHT = 0.75;
const FUZZY_MATCH_WEIGHT = 0.5;

/**
 * Max edits tolerated for a token of a given length, mirroring the "AUTO"
 * fuzziness convention (e.g. Elasticsearch): tokens up to 2 chars must
 * match exactly or by prefix (general edit-distance is too noisy at that
 * length — e.g. "me" would fuzzy-match "re"), 3-5 char tokens tolerate one
 * edit, longer tokens tolerate two.
 */
function fuzzyMatchThreshold(tokenLength: number): number {
  if (tokenLength <= 2) return 0;
  if (tokenLength <= 5) return 1;
  return 2;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let previousRow = Array.from({ length: bLen + 1 }, (_, j) => j);

  for (let i = 1; i <= aLen; i++) {
    const currentRow = new Array<number>(bLen + 1);
    currentRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        previousRow[j]! + 1,
        currentRow[j - 1]! + 1,
        previousRow[j - 1]! + cost,
      );
    }
    previousRow = currentRow;
  }

  return previousRow[bLen]!;
}

function splitToWords(normalizedValue: string): string[] {
  return normalizedValue.split(/[\s@._+-]+/).filter(Boolean);
}

/**
 * Prefix fallback for when a query token has no exact match — e.g. "hi"
 * should still find "hii" or "him", mirroring the wildcard suffix the app
 * already sends to the server (see toJmapTextQuery). Requires the word to
 * be strictly longer than the token so it doesn't re-detect exact matches.
 */
function prefixTokenMatchesWords(words: string[], token: string): boolean {
  return words.some(
    (word) => word.length > token.length && word.startsWith(token),
  );
}

/**
 * Typo-tolerant fallback for when a query token has no exact or prefix
 * match in the field text — e.g. "meesage" should still find "message".
 * Only checked once those checks fail, so it never weakens better matches.
 */
function fuzzyTokenMatchesWords(words: string[], token: string): boolean {
  const maxDistance = fuzzyMatchThreshold(token.length);
  if (maxDistance === 0) return false;

  for (const word of words) {
    if (Math.abs(word.length - token.length) > maxDistance) continue;
    if (levenshteinDistance(token, word) <= maxDistance) return true;
  }
  return false;
}

function scoreFields(
  fields: SearchField[],
  query: string,
): MailSearchScore | null {
  const queryTokens = tokenizeSearchQuery(query);
  if (queryTokens.length === 0) return null;

  const normalizedPhrase = normalizeSearchText(query);
  const matchedFields = new Set<string>();
  let score = 0;
  let snippetSource = "";

  for (const field of fields) {
    const normalizedValue = normalizeSearchText(field.value);
    if (!normalizedValue) continue;

    const words = splitToWords(normalizedValue);
    let exactCount = 0;
    let prefixCount = 0;
    let fuzzyCount = 0;
    for (const token of queryTokens) {
      if (tokenMatchesInText(normalizedValue, token)) {
        exactCount++;
      } else if (prefixTokenMatchesWords(words, token)) {
        prefixCount++;
      } else if (fuzzyTokenMatchesWords(words, token)) {
        fuzzyCount++;
      }
    }

    const matchingTokenCount = exactCount + prefixCount + fuzzyCount;
    if (matchingTokenCount === 0) continue;

    matchedFields.add(field.name);
    score +=
      exactCount * field.weight +
      prefixCount * field.weight * PREFIX_MATCH_WEIGHT +
      fuzzyCount * field.weight * FUZZY_MATCH_WEIGHT;

    const allTokensMatch = matchingTokenCount === queryTokens.length;
    if (allTokensMatch) score += field.weight;
    if (normalizedPhrase && normalizedValue.includes(normalizedPhrase)) {
      score += field.weight * 2;
    }
    if (normalizedPhrase && normalizedValue === normalizedPhrase) {
      score += field.weight * 5;
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

export function scoreMailSearchMessage(
  message: MailSearchScorableMessage,
  query: string,
): MailSearchScore | null {
  const attachmentText = (message.attachments ?? [])
    .map((attachment) => `${attachment.name ?? ""} ${attachment.type ?? ""}`)
    .join(" ");

  const scored = scoreFields(
    [
      { name: "subject", value: message.subject ?? "", weight: 8 },
      { name: "from", value: getMailFromLabel(message), weight: 6 },
      {
        name: "to",
        value: [
          formatRecipientText(message.to),
          formatRecipientText(message.cc),
          formatRecipientText(message.bcc),
        ]
          .filter(Boolean)
          .join(" "),
        weight: 4,
      },
      { name: "body", value: extractSearchableBody(message), weight: 2 },
      { name: "attachment", value: attachmentText, weight: 2 },
    ],
    query,
  );

  if (!scored) return null;

  const unreadBoost = message.keywords?.["$seen"] ? 0 : 0.4;
  const recencyBoost = message.receivedAt
    ? Math.max(
        0,
        1 -
          (Date.now() - new Date(message.receivedAt).getTime()) /
            (1000 * 60 * 60 * 24 * 180),
      )
    : 0;

  return {
    ...scored,
    score: scored.score + unreadBoost + recencyBoost,
  };
}

export function sortMailMessagesBySearchRelevance<T extends MailSearchScorableMessage>(
  messages: T[],
  query: string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed || messages.length <= 1) return messages;

  const ranked = messages
    .map((message, index) => ({
      message,
      index,
      scored: scoreMailSearchMessage(message, trimmed),
    }))
    .sort((left, right) => {
      const leftScore = left.scored?.score;
      const rightScore = right.scored?.score;
      const leftHasScore = leftScore !== null && leftScore !== undefined;
      const rightHasScore = rightScore !== null && rightScore !== undefined;

      if (leftHasScore !== rightHasScore) {
        return leftHasScore ? -1 : 1;
      }

      if (
        leftHasScore &&
        rightHasScore &&
        rightScore !== leftScore
      ) {
        return rightScore - leftScore;
      }

      if (left.index !== right.index) {
        return left.index - right.index;
      }

      const leftTime = left.message.receivedAt ?? "";
      const rightTime = right.message.receivedAt ?? "";
      return rightTime.localeCompare(leftTime);
    });

  return ranked.map((entry) => entry.message);
}

/**
 * Strips JMAP wildcard suffixes from a text filter so client-side relevance
 * ranking uses the same tokens the user typed.
 */
export function extractTextQueryFromJmapFilter(
  filter: Record<string, unknown>,
): string | undefined {
  if (typeof filter.text === "string") {
    return filter.text
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/\*+$/, ""))
      .filter(Boolean)
      .join(" ");
  }

  if (filter.operator === "AND" && Array.isArray(filter.conditions)) {
    for (const condition of filter.conditions) {
      if (!condition || typeof condition !== "object") continue;
      const nested = extractTextQueryFromJmapFilter(
        condition as Record<string, unknown>,
      );
      if (nested) return nested;
    }
  }

  return undefined;
}
