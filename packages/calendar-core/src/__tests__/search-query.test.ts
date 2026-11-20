import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";
import {
  CALENDAR_SEARCH_OPERATOR_KEYS,
  MAIL_SEARCH_OPERATOR_KEYS,
  NEGATED_TEXT_KEY,
  SEARCH_QUERY_MAX_LENGTH,
  hasSearchOperators,
  parseSearchQuery,
  type ParsedSearchQuery,
} from "../index";

const calendar = (input: string) => parseSearchQuery(input, CALENDAR_SEARCH_OPERATOR_KEYS);
const op = (key: string, value: string, negated = false) => ({ key, value, negated });

describe("parseSearchQuery", () => {
  it.each<[string, ParsedSearchQuery]>([
    ["", { terms: [], operators: [] }],
    ["  team\tlunch Friday ", { terms: ["team", "lunch", "Friday"], operators: [] }],
    ['"weekly sync" notes', { terms: ["weekly sync", "notes"], operators: [] }],
    ['standup "half open', { terms: ["standup", "half open"], operators: [] }],
    ["location:Utrecht", { terms: [], operators: [op("location", "Utrecht")] }],
    ['location:"Main Hall" demo', { terms: ["demo"], operators: [op("location", "Main Hall")] }],
    ["Guest:Ana IS:allday", { terms: [], operators: [op("guest", "Ana"), op("is", "allday")] }],
    ["after:2026-11-01T10:00", { terms: [], operators: [op("after", "2026-11-01T10:00")] }],
    ["re:foo https://x.test", { terms: ["re:foo", "https://x.test"], operators: [] }],
    ["from:alice", { terms: ["from:alice"], operators: [] }],
    ["location: dinner", { terms: ["location:", "dinner"], operators: [] }],
    ['location:""', { terms: ["location:"], operators: [] }],
    ['"location:Utrecht"', { terms: ["location:Utrecht"], operators: [] }],
    ["-draft", { terms: [], operators: [op(NEGATED_TEXT_KEY, "draft", true)] }],
    ['-"team lunch"', { terms: [], operators: [op(NEGATED_TEXT_KEY, "team lunch", true)] }],
    ["-location:Home", { terms: [], operators: [op("location", "Home", true)] }],
    ["-foo:bar", { terms: [], operators: [op(NEGATED_TEXT_KEY, "foo:bar", true)] }],
    ["- alone", { terms: ["alone"], operators: [] }],
    ['"-literal"', { terms: ["-literal"], operators: [] }],
  ])("parses %j", (input, expected) => {
    expect(calendar(input)).toEqual(expected);
  });

  it("only recognizes the keys it is given", () => {
    expect(parseSearchQuery('from:alice subject:"weekly sync" -is:read', MAIL_SEARCH_OPERATOR_KEYS)).toEqual({
      terms: [],
      operators: [op("from", "alice"), op("subject", "weekly sync"), op("is", "read", true)],
    });
    expect(MAIL_SEARCH_OPERATOR_KEYS.has("filename")).toBe(false);
    expect(calendar("subject:x guest:y")).toEqual({
      terms: ["subject:x"],
      operators: [op("guest", "y")],
    });
  });

  it("reports operators, including negated words", () => {
    expect(hasSearchOperators(calendar("lunch"))).toBe(false);
    expect(hasSearchOperators(calendar("lunch -draft"))).toBe(true);
    expect(hasSearchOperators(calendar("is:recurring"))).toBe(true);
  });

  it("parses at most the capped length of a pasted blob", () => {
    const parsed = calendar(`${"a ".repeat(SEARCH_QUERY_MAX_LENGTH)}tail`);
    expect(parsed.terms).toHaveLength(SEARCH_QUERY_MAX_LENGTH / 2);
    expect(parsed.terms).not.toContain("tail");
  });
});

const queryArb = fc.oneof(
  fc.string({ maxLength: 200 }),
  fc
    .array(
      fc.constantFrom("from", "is", "location", "Guest", ":", '"', "-", " ", "\t", " ", "a", "B c", "é", "2026-11-01"),
      { maxLength: 40 },
    )
    .map((parts) => parts.join("")),
);

const keySetArb = fc.constantFrom(CALENDAR_SEARCH_OPERATOR_KEYS, MAIL_SEARCH_OPERATOR_KEYS);

/** Writes a parsed query back as text with every value quoted. */
function formatQuery({ terms, operators }: ParsedSearchQuery): string {
  return [
    ...terms.map((term) => `"${term}"`),
    ...operators.map(({ key, value, negated }) =>
      key === NEGATED_TEXT_KEY ? `-"${value}"` : `${negated ? "-" : ""}${key}:"${value}"`,
    ),
  ].join(" ");
}

describe("parseSearchQuery properties", () => {
  it("only yields trimmed, quote-free, non-empty parts with known keys", () => {
    fc.assert(
      fc.property(queryArb, keySetArb, (input, keys) => {
        const parsed = parseSearchQuery(input, keys);
        for (const part of [...parsed.terms, ...parsed.operators.map((entry) => entry.value)]) {
          expect(part).not.toBe("");
          expect(part).not.toContain('"');
          expect(part).toBe(part.trim());
        }
        for (const { key, negated } of parsed.operators) {
          expect(key === NEGATED_TEXT_KEY ? negated : keys.has(key)).toBe(true);
        }
      }),
    );
  });

  it("parses its own formatted output to the same query", () => {
    fc.assert(
      fc.property(queryArb, keySetArb, (input, keys) => {
        const parsed = parseSearchQuery(input, keys);
        expect(parseSearchQuery(formatQuery(parsed), keys)).toEqual(parsed);
      }),
    );
  });
});
