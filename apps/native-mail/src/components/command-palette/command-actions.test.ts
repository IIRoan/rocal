import {
  getSettingsHubItems,
  getSettingsMailItems,
} from "@workspace/calendar-core";
import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
} from "./command-actions";

describe("buildCommandActions", () => {
  it("returns mail, appearance, security, and navigation actions before settings jumps", () => {
    const ids = buildCommandActions()
      .filter((a) => a.group !== "Settings")
      .map((a) => a.id);
    expect(ids).toEqual([
      "compose-mail",
      "theme-light",
      "theme-dark",
      "theme-system",
      "add-passkey",
      "delete-passkey",
      "open-mail",
      "open-settings",
    ]);
  });

  it("generates settings jumps from the shared native hub and mail lists", () => {
    const expected = [
      ...getSettingsHubItems("native")
        .filter((item) => item.id !== "calendar")
        .map((item) => item.id),
      ...getSettingsMailItems("native")
        .filter((item) => item.id !== "mailboxes")
        .map((item) => item.id),
    ];
    const jumps = buildCommandActions().filter((a) => a.group === "Settings");
    expect(jumps.map((a) => a.settingsSection)).toEqual(expected);
    expect(jumps.every((a) => a.icon)).toBe(true);
  });

  it("never offers a jump to the calendar or drawer-only mailbox sections", () => {
    const sections = buildCommandActions().map((a) => a.settingsSection);
    expect(sections).not.toContain("calendar");
    expect(sections).not.toContain("mailboxes");
  });
});

describe("filterCommandActions", () => {
  const actions = buildCommandActions();

  it("returns all actions for an empty or whitespace query", () => {
    expect(filterCommandActions(actions, "")).toHaveLength(actions.length);
    expect(filterCommandActions(actions, "   ")).toHaveLength(actions.length);
  });

  it("matches against the label case-insensitively", () => {
    const result = filterCommandActions(actions, "COMPOSE");
    expect(result.map((a) => a.id)).toContain("compose-mail");
  });

  it("matches against keywords when the label does not match", () => {
    const result = filterCommandActions(actions, "inbox");
    expect(result.map((a) => a.id)).toContain("open-mail");
  });

  it("matches theme commands by mode", () => {
    const result = filterCommandActions(actions, "dark mode");
    expect(result.map((a) => a.id)).toEqual(["theme-dark"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommandActions(actions, "zzzznotacommand")).toHaveLength(0);
  });
});

describe("groupCommandActions", () => {
  it("groups actions in a stable section order", () => {
    const sections = groupCommandActions(buildCommandActions());
    expect(sections.map((s) => s.group)).toEqual([
      "Mail",
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
