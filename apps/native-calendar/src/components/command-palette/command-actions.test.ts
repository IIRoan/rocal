import { getSettingsHubItems } from "@workspace/calendar-core";
import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
} from "./command-actions";

describe("buildCommandActions", () => {
  it("returns calendar, appearance, security, and navigation actions before settings jumps", () => {
    const ids = buildCommandActions()
      .filter((a) => a.group !== "Settings")
      .map((a) => a.id);
    expect(ids).toEqual([
      "new-event",
      "go-today",
      "view-week",
      "view-day",
      "view-3day",
      "view-month",
      "view-agenda",
      "new-calendar",
      "manage-calendars",
      "theme-light",
      "theme-dark",
      "theme-system",
      "add-passkey",
      "delete-passkey",
      "open-calendar",
      "open-settings",
    ]);
  });

  it("attaches a calendar view to every view-switch action", () => {
    const viewActions = buildCommandActions().filter((a) =>
      a.id.startsWith("view-"),
    );
    expect(viewActions.length).toBe(5);
    expect(viewActions.map((a) => a.view).sort()).toEqual([
      "3day",
      "agenda",
      "day",
      "month",
      "week",
    ]);
    expect(viewActions.every((a) => a.id === `view-${a.view}`)).toBe(true);
  });

  it("generates one settings jump per native hub section except mail", () => {
    const expected = getSettingsHubItems("native")
      .filter((item) => item.id !== "mail")
      .map((item) => item.id);
    const jumps = buildCommandActions().filter((a) => a.group === "Settings");
    expect(jumps.map((a) => a.settingsSection)).toEqual(expected);
    expect(jumps.map((a) => a.id)).toEqual(
      expected.map((id) => `settings-${id}`),
    );
    expect(jumps.every((a) => a.icon)).toBe(true);
  });

  it("maps theme commands to theme preferences", () => {
    const themes = buildCommandActions()
      .filter((a) => a.theme)
      .map((a) => a.theme);
    expect(themes).toEqual(["light", "dark", "system"]);
  });

  it("sends passkey deletion to Security settings", () => {
    const deletePasskey = buildCommandActions().find(
      (a) => a.id === "delete-passkey",
    );
    expect(deletePasskey?.settingsSection).toBe("security");
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

  it("finds the month and agenda views", () => {
    expect(filterCommandActions(actions, "month view").map((a) => a.id)).toEqual([
      "view-month",
    ]);
    expect(filterCommandActions(actions, "upcoming").map((a) => a.id)).toEqual([
      "view-agenda",
    ]);
  });

  it("matches against keywords when the label does not match", () => {
    const result = filterCommandActions(actions, "appointment");
    expect(result.map((a) => a.id)).toContain("new-event");
  });

  it("finds settings jumps through their section description", () => {
    const result = filterCommandActions(actions, "reminder");
    expect(result.map((a) => a.id)).toContain("settings-notifications");
  });

  it("finds calendar management through delete wording", () => {
    const result = filterCommandActions(actions, "delete calendar");
    expect(result.map((a) => a.id)).toEqual(["manage-calendars"]);
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
  it("groups actions in a stable section order", () => {
    const sections = groupCommandActions(buildCommandActions());
    expect(sections.map((s) => s.group)).toEqual([
      "Calendar",
      "Appearance",
      "Security",
      "Navigation",
      "Settings",
    ]);
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
