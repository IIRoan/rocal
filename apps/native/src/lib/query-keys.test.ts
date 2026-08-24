import { QUERY_KEYS } from "./query-keys";

describe("QUERY_KEYS", () => {
  it("builds an events key from a start/end range", () => {
    expect(QUERY_KEYS.events("2024-01-01", "2024-01-31")).toEqual([
      "events",
      "2024-01-01",
      "2024-01-31",
    ]);
  });

  it("exposes stable static list keys", () => {
    expect(QUERY_KEYS.calendars()).toEqual(["calendars"]);
    expect(QUERY_KEYS.categories()).toEqual(["categories"]);
    expect(QUERY_KEYS.settings()).toEqual(["settings"]);
    expect(QUERY_KEYS.subscriptions()).toEqual(["subscriptions"]);
  });

  it("builds id-scoped detail keys", () => {
    expect(QUERY_KEYS.eventDetail("evt-1")).toEqual(["event", "evt-1"]);
    expect(QUERY_KEYS.notifications("evt-1")).toEqual([
      "notifications",
      "evt-1",
    ]);
    expect(QUERY_KEYS.calendarShareLink("cal-1")).toEqual([
      "calendarShareLink",
      "cal-1",
    ]);
    expect(QUERY_KEYS.searchResults("party")).toEqual(["search", "party"]);
  });

  it("namespaces mail keys under a shared prefix", () => {
    expect(QUERY_KEYS.mailAccount()).toEqual(["mail", "account"]);
    expect(QUERY_KEYS.mailRuntime()).toEqual(["mail", "runtime"]);
    expect(QUERY_KEYS.mailMessages(null)).toEqual(["mail", "messages", null]);
    expect(QUERY_KEYS.mailMessages("inbox")).toEqual([
      "mail",
      "messages",
      "inbox",
    ]);
    expect(QUERY_KEYS.mailMessage("m-1")).toEqual(["mail", "message", "m-1"]);
    expect(QUERY_KEYS.invites()).toEqual(["invites"]);
    expect(QUERY_KEYS.hiddenMailboxIds()).toEqual(["mail", "hiddenMailboxIds"]);
  });
});
