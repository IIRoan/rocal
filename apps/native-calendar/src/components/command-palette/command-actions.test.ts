import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
} from "./command-actions";

describe("buildCommandActions", () => {
  it("returns calendar and navigation actions only", () => {
    const actions = buildCommandActions();
    expect(actions.map((a) => a.id)).toEqual([
      "new-event",
      "go-today",
      "view-week",
      "view-day",
      "view-3day",
      "open-calendar",
      "open-settings",
      "open-notification-settings",
    ]);
  });

  it("attaches a calendar view to every view-switch action", () => {
    const viewActions = buildCommandActions().filter((a) =>
      a.id.startsWith("view-"),
    );
    expect(viewActions.length).toBe(3);
    expect(viewActions.map((a) => a.view).sort()).toEqual([
      "3day",
      "day",
      "week",
    ]);
  });
});

describe("filterCommandActions", () => {
  const actions = buildCommandActions();

  it("returns all actions for an empty or whitespace query", () => {
    expect(filterCommandActions(actions, "")).toHaveLength(actions.length);
    expect(filterCommandActions(actions, "   ")).toHaveLength(actions.length);
  });

  it("matches against the label case-insensitively", () => {
    const result = filterCommandActions(actions, "WEEK VIEW");
    expect(result.some((a) => a.id === "view-week")).toBe(true);
  });

  it("matches against keywords when the label does not match", () => {
    const result = filterCommandActions(actions, "appointment");
    expect(result.map((a) => a.id)).toContain("new-event");
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
  it("groups actions in Calendar → Navigation order", () => {
    const sections = groupCommandActions(buildCommandActions());
    expect(sections.map((s) => s.group)).toEqual(["Calendar", "Navigation"]);
  });

  it("omits empty groups", () => {
    const onlyNavigation = buildCommandActions().filter(
      (a) => a.group === "Navigation",
    );
    const sections = groupCommandActions(onlyNavigation);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.group).toBe("Navigation");
  });
});
