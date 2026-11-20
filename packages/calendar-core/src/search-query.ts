/** Longer input is cut off before parsing, so a pasted blob never costs more than this many characters. */
export const SEARCH_QUERY_MAX_LENGTH = 1000;

/** Operator key a negated plain word (`-word`) carries; never a typed key. */
export const NEGATED_TEXT_KEY = "text";

export const CALENDAR_SEARCH_OPERATOR_KEYS: ReadonlySet<string> = new Set([
  "guest",
  "location",
  "calendar",
  "after",
  "before",
  "is",
]);

export const MAIL_SEARCH_OPERATOR_KEYS: ReadonlySet<string> = new Set([
  "from",
  "to",
  "cc",
  "subject",
  "has",
  "is",
  "in",
  "label",
  "before",
  "after",
  "larger",
  "smaller",
]);

export type SearchQueryOperator = { key: string; value: string; negated: boolean };

export type ParsedSearchQuery = { terms: string[]; operators: SearchQueryOperator[] };

function splitQuotedTokens(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quoted = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    if (!quoted && /\s/.test(char)) {
      if (token) tokens.push(token);
      token = "";
    } else {
      token += char;
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

function unquote(value: string): string {
  return value.replace(/"/g, "").trim();
}

/** Splits a typed query into plain terms and `[-]key:value` operators whose key is in `knownKeys`; a quoted token is always a plain term. */
export function parseSearchQuery(
  input: string,
  knownKeys: ReadonlySet<string>,
): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = { terms: [], operators: [] };
  for (const raw of splitQuotedTokens(input.slice(0, SEARCH_QUERY_MAX_LENGTH))) {
    if (raw === "-") continue;
    const negated = raw.length > 1 && raw.startsWith("-");
    const body = negated ? raw.slice(1) : raw;
    const colon = body.indexOf(":");
    const quote = body.indexOf('"');
    if (colon > 0 && (quote === -1 || quote > colon)) {
      const key = body.slice(0, colon).toLowerCase();
      const value = unquote(body.slice(colon + 1));
      if (value && knownKeys.has(key)) {
        parsed.operators.push({ key, value, negated });
        continue;
      }
    }
    const text = unquote(body);
    if (!text) continue;
    if (negated) {
      parsed.operators.push({ key: NEGATED_TEXT_KEY, value: text, negated: true });
    } else {
      parsed.terms.push(text);
    }
  }
  return parsed;
}

export function hasSearchOperators(parsed: ParsedSearchQuery): boolean {
  return parsed.operators.length > 0;
}
