import { describe, expect, it } from "@jest/globals";
import { buildJmapFilter, conditionToChip, resolveMailSearchScope } from "../mail-search-filter";
import {
  formatMailSearchQuery,
  liftMailSearchOperators,
  mergeMailSearchFilters,
  parseMailSearchQuery,
} from "../mail-search-operators";

const context = {
  mailboxes: [
    { id: "mb-inbox", name: "Inbox", role: "inbox" },
    { id: "mb-junk", name: "Junk", role: "junk" },
    { id: "mb-trips", name: "Trips 2026", role: null },
  ],
  labels: [{ id: "l-work", name: "Work" }],
};

describe("parseMailSearchQuery", () => {
  it("maps every key to one condition, keeping plain words as text", () => {
    const parsed = parseMailSearchQuery(
      'invoice FROM:alice to:bob cc:carol subject:"Q3 report" has:attachment is:read is:Starred before:2026-11-14 after:2026-01-01 larger:500K smaller:10M',
      context,
    );
    expect(parsed.text).toBe("invoice");
    expect(parsed.issues).toEqual([]);
    expect(parsed.filters.conditions).toEqual([
      { from: "alice" },
      { to: "bob" },
      { cc: "carol" },
      { subject: "Q3 report" },
      { hasAttachment: true },
      { isRead: true },
      { isFlagged: true },
      { before: "2026-11-14" },
      { after: "2026-01-01" },
      { minSize: 500_000 },
      { maxSize: 10_000_000 },
    ]);
  });

  it("negates per operator and turns a negated word into a text condition", () => {
    expect(parseMailSearchQuery("-is:read -newsletter", context).filters.conditions).toEqual([
      { isRead: true, negated: true },
      { text: "newsletter", negated: true },
    ]);
  });

  it("resolves folders by role or opened name, and labels by name, on the device", () => {
    expect(parseMailSearchQuery("in:spam in:inbox", context).filters.conditions).toEqual([
      { inMailbox: { id: "mb-junk", name: "spam" } },
      { inMailbox: { id: "mb-inbox", name: "inbox" } },
    ]);
    expect(parseMailSearchQuery('in:"trips 2026" label:work', context).filters.conditions).toEqual([
      { inMailbox: { id: "mb-trips", name: "trips 2026" } },
      { label: { id: "l-work", name: "work" } },
    ]);
  });

  it("drops what it cannot use, reports why and never searches it as text", () => {
    const parsed = parseMailSearchQuery("in:nowhere label:x before:soon larger:huge is:maybe report", context);
    expect(parsed.text).toBe("report");
    expect(parsed.filters.conditions).toEqual([]);
    expect(parsed.unresolved).toBe("in:nowhere label:x before:soon larger:huge is:maybe");
    expect(parsed.issues).toEqual([
      "No folder named “nowhere”.",
      "No label named “x”.",
      "Use dates like 2026-11-14.",
      "Use sizes like 500K or 10M.",
      "Use is:read, is:unread or is:starred.",
    ]);
  });

  it("leaves unknown keys as plain words", () => {
    expect(parseMailSearchQuery("filename:report.pdf note:x", context)).toMatchObject({
      text: "filename:report.pdf note:x",
      filters: { conditions: [] },
    });
  });
});

describe("lift and format", () => {
  it("lifts recognized operators beside the current chips and keeps the rest typed", () => {
    const lifted = liftMailSearchOperators("budget from:alice in:nowhere", { conditions: [{ isUnread: true }] }, context);
    expect(lifted).toEqual({
      text: "budget in:nowhere",
      filters: { conditions: [{ isUnread: true }, { from: "alice" }] },
    });
  });

  it("formats conditions back into a query that parses to the same conditions", () => {
    const query = 'trip -from:"Ada Lovelace" in:"trips 2026" label:work larger:2M -is:read -spam';
    const parsed = parseMailSearchQuery(query, context);
    const formatted = formatMailSearchQuery(parsed.text, parsed.filters.conditions);
    expect(formatted).toBe(query);
    expect(parseMailSearchQuery(formatted, context).filters).toEqual(parsed.filters);
  });

  it("merges without repeats", () => {
    expect(mergeMailSearchFilters({ text: "a", conditions: [{ from: "x" }] }, { conditions: [{ from: "x" }, { to: "y" }] })).toEqual({
      text: "a",
      conditions: [{ from: "x" }, { to: "y" }],
    });
  });
});

describe("JMAP mapping", () => {
  it("wraps negated conditions in NOT and lets a typed folder replace the scope", () => {
    const filters = parseMailSearchQuery("in:junk -from:ada label:work -in:inbox larger:1M", context).filters;
    expect(resolveMailSearchScope("current", filters)).toBe("mb-junk");
    expect(buildJmapFilter("current", filters, { timezone: "UTC" })).toEqual({
      operator: "AND",
      conditions: [
        {
          operator: "AND",
          conditions: [
            { inMailbox: "mb-junk", hasKeyword: "label:l-work" },
            { inMailbox: "mb-junk", minSize: 1_000_000 },
          ],
        },
        { operator: "NOT", conditions: [{ from: "ada" }] },
        { operator: "NOT", conditions: [{ inMailbox: "mb-inbox" }] },
      ],
    });
  });

  it("keeps the existing shapes without negation", () => {
    expect(buildJmapFilter("mb", { conditions: [{ cc: "carol" }] })).toEqual({ inMailbox: "mb", cc: "carol" });
    expect(buildJmapFilter("mb", { conditions: [{ isRead: true }] })).toEqual({ inMailbox: "mb", hasKeyword: "$seen" });
    expect(buildJmapFilter("mb", { conditions: [{ text: "promo", negated: true }] })).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "mb" }, { operator: "NOT", conditions: [{ text: "promo*" }] }],
    });
  });

  it("labels chips like the typed operators", () => {
    expect(conditionToChip({ minSize: 500_000, negated: true })[0]?.label).toBe("-larger:500K");
    expect(conditionToChip({ label: { id: "l", name: "Big work" } })[0]?.label).toBe('label:"Big work"');
    expect(conditionToChip({ maxSize: 1234 })[0]?.label).toBe("smaller:1234");
  });
});

describe("repeated operators", () => {
  it("keeps one condition per repeated operator", () => {
    expect(parseMailSearchQuery("from:a FROM:a -from:a", context).filters.conditions).toEqual([
      { from: "a" },
      { from: "a", negated: true },
    ]);
  });
});
