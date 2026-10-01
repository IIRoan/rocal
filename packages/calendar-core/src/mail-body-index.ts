import type { TitleIndexDocument } from "./title-search-index";
import { looksLikeMimeMessage } from "./outgoing-mime";

/** Per-message cap so the encrypted on-device index stays small. */
export const MAIL_BODY_EXCERPT_MAX_CHARS = 5000;
/** Only the newest messages carry a body excerpt. */
export const MAIL_BODY_MAX_INDEXED = 1000;
const DEFAULT_PASS_LIMIT = 60;
const DEFAULT_BATCH_SIZE = 10;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : " ";
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

/** Plain, whitespace-collapsed text of a decrypted message, truncated for the on-device index. */
export function buildMailBodyExcerpt(input: {
  text?: string | null;
  html?: string | null;
}): string {
  const source =
    input.text?.trim() && !(input.html && looksLikeMimeMessage(input.text))
      ? input.text
      : stripHtml(input.html ?? "");
  return source
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAIL_BODY_EXCERPT_MAX_CHARS);
}

/** A short window of the body around the first query word that appears in it. */
export function mailBodySnippet(
  body: string,
  queryWords: readonly string[],
  radius = 48,
): string | undefined {
  const lower = body.toLowerCase();
  let index = -1;
  for (const word of queryWords) {
    const found = word ? lower.indexOf(word) : -1;
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return undefined;

  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + radius * 2);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
}

/** True when a search hit matched only the message text, so the snippet is the useful context. */
export function isBodyOnlyMatch(matchedFields: readonly string[]): boolean {
  return matchedFields.length === 1 && matchedFields[0] === "body";
}

export type MailBodyLoader = (
  batch: TitleIndexDocument[],
) => Promise<Map<string, string>>;

/** Carries over recent excerpts and leaves failed reads pending for a later pass. */
export async function refreshMailBodyExcerpts(input: {
  documents: TitleIndexDocument[];
  previous: readonly TitleIndexDocument[];
  loadBodies: MailBodyLoader;
  maxIndexed?: number;
  passLimit?: number;
  batchSize?: number;
}): Promise<{
  documents: TitleIndexDocument[];
  pending: number;
  loaded: number;
}> {
  const maxIndexed = input.maxIndexed ?? MAIL_BODY_MAX_INDEXED;
  const passLimit = input.passLimit ?? DEFAULT_PASS_LIMIT;
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;

  const previousBodies = new Map<string, string>();
  for (const document of input.previous) {
    if (document.source === "mail" && document.body !== undefined) {
      previousBodies.set(document.id, document.body);
    }
  }

  const newestIds = new Set(
    input.documents
      .filter((document) => document.source === "mail")
      .sort((left, right) =>
        (right.timestamp ?? "").localeCompare(left.timestamp ?? ""),
      )
      .slice(0, maxIndexed)
      .map((document) => document.id),
  );

  const bodies = new Map<string, string>();
  const missing: TitleIndexDocument[] = [];
  for (const document of input.documents) {
    if (!newestIds.has(document.id)) continue;
    const carried = previousBodies.get(document.id);
    if (carried !== undefined) bodies.set(document.id, carried);
    else missing.push(document);
  }
  missing.sort((left, right) =>
    (right.timestamp ?? "").localeCompare(left.timestamp ?? ""),
  );

  let loadedCount = 0;
  let cursor = 0;
  while (cursor < missing.length && loadedCount < passLimit) {
    const batch = missing.slice(
      cursor,
      cursor + Math.min(batchSize, passLimit - loadedCount),
    );
    cursor += batch.length;
    let loaded: Map<string, string>;
    try {
      loaded = await input.loadBodies(batch);
    } catch {
      break;
    }
    if (!batch.some((document) => loaded.has(document.id))) break;
    for (const document of batch) {
      const body = loaded.get(document.id);
      if (body === undefined) continue;
      bodies.set(document.id, body);
      loadedCount += 1;
    }
  }

  const documents = input.documents.map((document) => {
    const { body: _previousBody, ...rest } = document;
    const body = bodies.get(document.id);
    return body === undefined ? rest : { ...rest, body };
  });

  return {
    documents,
    pending: missing.length - loadedCount,
    loaded: loadedCount,
  };
}
