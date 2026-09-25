import {
  buildCommandActions,
  filterCommandActions,
  groupCommandActions,
} from "./command-actions";

describe("buildCommandActions", () => {
  it("returns mail and navigation actions only", () => {
    expect(buildCommandActions().map((a) => a.id)).toEqual([
      "compose-mail",
      "open-mail",
      "open-settings",
      "open-notification-settings",
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
    const result = filterCommandActions(actions, "COMPOSE");
    expect(result.map((a) => a.id)).toEqual(["compose-mail"]);
  });

  it("matches against keywords when the label does not match", () => {
    const result = filterCommandActions(actions, "inbox");
    expect(result.map((a) => a.id)).toContain("open-mail");
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCommandActions(actions, "zzzznotacommand")).toHaveLength(0);
  });
});

describe("groupCommandActions", () => {
  it("groups actions in Mail → Navigation order", () => {
    const sections = groupCommandActions(buildCommandActions());
    expect(sections.map((s) => s.group)).toEqual(["Mail", "Navigation"]);
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
