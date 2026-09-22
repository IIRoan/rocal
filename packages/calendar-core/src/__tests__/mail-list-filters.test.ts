import {
  DEFAULT_MAIL_LIST_FILTERS,
  applyMailListFilters,
  countActiveMailListFilters,
  type MailListFilters,
} from "../mail-list-view-filter";

const NOW = new Date("2026-03-15T10:00:00.000Z");
const TZ = "Europe/Amsterdam";

type TestMessage = {
  id: string;
  keywords?: Record<string, boolean>;
  hasAttachment?: boolean;
  receivedAt?: string;
};

const messages: TestMessage[] = [
  {
    id: "unread-today",
    keywords: { "label:work": true },
    receivedAt: "2026-03-15T08:00:00.000Z",
  },
  {
    id: "read-starred-file",
    keywords: { $seen: true, $flagged: true },
    hasAttachment: true,
    receivedAt: "2026-03-12T08:00:00.000Z",
  },
  {
    id: "read-old",
    keywords: { $seen: true, "label:home": true },
    receivedAt: "2026-01-01T08:00:00.000Z",
  },
  { id: "no-date", keywords: {} },
];

function ids(filters: Partial<MailListFilters>) {
  return applyMailListFilters(
    messages,
    { ...DEFAULT_MAIL_LIST_FILTERS, ...filters },
    { now: NOW, timezone: TZ },
  ).map((message) => message.id);
}

describe("applyMailListFilters", () => {
  it("returns everything with default filters", () => {
    expect(ids({})).toHaveLength(messages.length);
  });

  it("filters by read state, star, and attachments", () => {
    expect(ids({ readState: "unread" })).toEqual(["unread-today", "no-date"]);
    expect(ids({ readState: "read" })).toEqual(["read-starred-file", "read-old"]);
    expect(ids({ starred: true })).toEqual(["read-starred-file"]);
    expect(ids({ attachments: true })).toEqual(["read-starred-file"]);
  });

  it("filters by age in the user's timezone and skips undated messages", () => {
    expect(ids({ age: "today" })).toEqual(["unread-today"]);
    expect(ids({ age: "week" })).toEqual(["unread-today", "read-starred-file"]);
    expect(ids({ age: "month" })).toEqual(["unread-today", "read-starred-file"]);
    expect(ids({ age: "older" })).toEqual(["read-old"]);
  });

  it("treats the zoned day boundary as today", () => {
    const justAfterMidnight = [
      { id: "a", receivedAt: "2026-03-14T23:30:00.000Z" },
      { id: "b", receivedAt: "2026-03-14T22:30:00.000Z" },
    ];
    const result = applyMailListFilters(
      justAfterMidnight,
      { ...DEFAULT_MAIL_LIST_FILTERS, age: "today" },
      { now: NOW, timezone: TZ },
    );
    expect(result.map((message) => message.id)).toEqual(["a"]);
  });

  it("matches any selected label and combines criteria with AND", () => {
    expect(ids({ labelIds: ["work", "home"] })).toEqual(["unread-today", "read-old"]);
    expect(ids({ labelIds: ["work", "home"], readState: "read" })).toEqual(["read-old"]);
  });
});

describe("countActiveMailListFilters", () => {
  it("counts each active criterion and label", () => {
    expect(countActiveMailListFilters(DEFAULT_MAIL_LIST_FILTERS)).toBe(0);
    expect(
      countActiveMailListFilters({
        readState: "unread",
        starred: true,
        attachments: true,
        age: "week",
        labelIds: ["a", "b"],
      }),
    ).toBe(6);
  });
});
