import {
  buildJmapFilter,
  buildMailSearchFilters,
  countMailSearchFieldValues,
  hasMailSearchFieldValues,
  isValidSearchDate,
  toJmapUtcDate,
} from "../mail-search-filter";

describe("toJmapUtcDate", () => {
  it("resolves a bare day to the start of that day in the user's timezone", () => {
    expect(toJmapUtcDate("2026-03-15", "Europe/Amsterdam")).toBe(
      "2026-03-14T23:00:00Z",
    );
    expect(toJmapUtcDate("2026-07-01", "Europe/Amsterdam")).toBe(
      "2026-06-30T22:00:00Z",
    );
    expect(toJmapUtcDate("2026-03-15", "America/New_York")).toBe(
      "2026-03-15T04:00:00Z",
    );
  });

  it("accepts ISO datetimes and strips milliseconds", () => {
    expect(toJmapUtcDate("2026-03-15T10:30:00.123Z")).toBe(
      "2026-03-15T10:30:00Z",
    );
  });

  it("rejects impossible or free-form dates", () => {
    expect(toJmapUtcDate("2026-02-30")).toBeNull();
    expect(toJmapUtcDate("2026-13-01")).toBeNull();
    expect(toJmapUtcDate("last week")).toBeNull();
    expect(isValidSearchDate("15-03-2026")).toBe(false);
    expect(isValidSearchDate(" 2026-03-15 ")).toBe(true);
  });
});

describe("buildMailSearchFilters", () => {
  const noToggles = {
    readState: "all",
    starred: false,
    attachments: false,
  } as const;

  it("detects whether any server-side field is set", () => {
    expect(hasMailSearchFieldValues({})).toBe(false);
    expect(hasMailSearchFieldValues({ from: "   " })).toBe(false);
    expect(hasMailSearchFieldValues({ before: "soon" })).toBe(false);
    expect(hasMailSearchFieldValues({ subject: "invoice" })).toBe(true);
    expect(hasMailSearchFieldValues({ after: "2026-01-01" })).toBe(true);
    expect(countMailSearchFieldValues({ from: "a", to: " ", body: "b" })).toBe(
      2,
    );
  });

  it("folds list toggles into one JMAP condition scoped to the mailbox", () => {
    const filters = buildMailSearchFilters(
      { from: " alice@example.com ", subject: "Invoice", after: "2026-03-01" },
      { readState: "unread", starred: true, attachments: true },
    );
    expect(
      buildJmapFilter("inbox", filters, { timezone: "Europe/Amsterdam" }),
    ).toEqual({
      inMailbox: "inbox",
      from: "alice@example.com",
      subject: "Invoice",
      after: "2026-02-28T23:00:00Z",
      hasKeyword: "$flagged",
      hasAttachment: true,
      notKeyword: "$seen",
    });
  });

  it("drops fields left blank and invalid dates", () => {
    const filters = buildMailSearchFilters(
      { to: "bob@example.com", body: "", before: "2026-02-31" },
      noToggles,
    );
    expect(buildJmapFilter("archive", filters)).toEqual({
      inMailbox: "archive",
      to: "bob@example.com",
    });
  });
});
import { buildMailboxFieldSearchFilter } from "../mail-search-filter";
import { DEFAULT_MAIL_LIST_FILTERS } from "../mail-list-view-filter";

describe("mailbox field search", () => {
  it("applies read, starred, age and any-of labels before pagination", () => {
    expect(
      buildMailboxFieldSearchFilter(
        "inbox",
        { from: "sender@example.com" },
        {
          ...DEFAULT_MAIL_LIST_FILTERS,
          readState: "read",
          starred: true,
          age: "week",
          labelIds: ["a", "b"],
        },
        { now: new Date("2026-03-30T10:00:00Z"), timezone: "Europe/Amsterdam" },
      ),
    ).toEqual({
      operator: "AND",
      conditions: [
        {
          inMailbox: "inbox",
          from: "sender@example.com",
          hasKeyword: "$flagged",
        },
        { hasKeyword: "$seen" },
        { after: "2026-03-23T23:00:00.000Z" },
        {
          operator: "OR",
          conditions: [{ hasKeyword: "label:a" }, { hasKeyword: "label:b" }],
        },
      ],
    });
  });
});
