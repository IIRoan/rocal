import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
} from "./command-actions";

describe("buildCommandActions", () => {
  it("returns calendar actions by default", () => {
    const actions = buildCommandActions();
    expect(actions.length).toBeGreaterThanOrEqual(11);
    expect(actions.some((a) => a.id === "new-event")).toBe(true);
    expect(actions.some((a) => a.id === "view-month")).toBe(true);
  });

  it("returns mail-only actions in mail scope", () => {
    const actions = buildCommandActions("mail");
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual([
      "compose-mail",
      "open-settings",
      "open-notification-settings",
      "open-calendar",
    ]);
    expect(actions.every((a) => a.group !== "Calendar")).toBe(true);
  });

  it("attaches a calendar view to every view-switch action", () => {
    const actions = buildCommandActions("calendar");
    const viewActions = actions.filter((a) => a.id.startsWith("view-"));
    expect(viewActions.length).toBe(5);
    expect(viewActions.map((a) => a.view).sort()).toEqual([
      "3day",
      "agenda",
      "day",
      "month",
      "week",
    ]);
  });
});

describe("filterCommandActions", () => {
  const actions = buildCommandActions("calendar");

  it("returns all actions for an empty or whitespace query", () => {
    expect(filterCommandActions(actions, "")).toHaveLength(actions.length);
    expect(filterCommandActions(actions, "   ")).toHaveLength(actions.length);
  });

  it("matches against the label case-insensitively", () => {
    const result = filterCommandActions(actions, "MONTH");
    expect(result.some((a) => a.id === "view-month")).toBe(true);
  });

  it("matches against keywords when the label does not match", () => {
    const result = filterCommandActions(actions, "write");
    expect(result.map((a) => a.id)).toContain("compose-mail");
  });

  it("preserves the original ordering of matches", () => {
    const result = filterCommandActions(actions, "view");
    const indices = result.map((a) => actions.indexOf(a));
    const sorted = [...indices].sort((x, y) => x - y);
    expect(indices).toEqual(sorted);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommandActions(actions, "zzzznotacommand")).toHaveLength(0);
  });
});

describe("groupCommandActions", () => {
  it("groups actions in Calendar → Mail → Navigation order", () => {
    const sections = groupCommandActions(buildCommandActions("calendar"));
    expect(sections.map((s) => s.group)).toEqual([
      "Calendar",
      "Mail",
      "Navigation",
    ]);
  });

  it("groups mail scope as Mail → Navigation", () => {
    const sections = groupCommandActions(buildCommandActions("mail"), "mail");
    expect(sections.map((s) => s.group)).toEqual(["Mail", "Navigation"]);
  });

  it("omits empty groups", () => {
    const onlyMail = buildCommandActions("calendar").filter(
      (a) => a.group === "Mail",
    );
    const sections = groupCommandActions(onlyMail);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.group).toBe("Mail");
  });
});
