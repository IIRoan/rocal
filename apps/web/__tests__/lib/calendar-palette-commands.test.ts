import { describe, expect, it, jest } from "@jest/globals";

import { COMMANDS } from "../../components/command-palette/navigation-config";
import { runCalendarPaletteCommand } from "../../lib/calendar-palette-commands";
import { getMatchingPaletteCommands } from "../../lib/command-palette-interactions";

function createHandlers() {
  return { setCurrentDate: jest.fn(), setCalendarView: jest.fn() };
}

describe("calendar palette commands", () => {
  it("lists go to today and every calendar view as commands", () => {
    const calendarCommands = COMMANDS.filter((command) =>
      ["goToday", "setView"].includes(command.execute.action),
    );
    expect(
      calendarCommands.map((command) => [
        command.command,
        command.execute.payload?.view,
      ]),
    ).toEqual([
      ["go to today", undefined],
      ["month view", "month"],
      ["week view", "week"],
      ["3 day view", "3day"],
      ["day view", "day"],
      ["agenda view", "agenda"],
    ]);
  });

  it("matches the today command from a partial query", () => {
    expect(
      getMatchingPaletteCommands(COMMANDS, true, "today").map(
        (command) => command.execute.action,
      ),
    ).toEqual(["goToday"]);
  });

  it("jumps to today", () => {
    const handlers = createHandlers();
    const now = new Date("2026-06-03T12:00:00.000Z");

    expect(
      runCalendarPaletteCommand("goToday", undefined, handlers, () => now),
    ).toBe(true);
    expect(handlers.setCurrentDate).toHaveBeenCalledWith(now);
    expect(handlers.setCalendarView).not.toHaveBeenCalled();
  });

  it.each(["month", "week", "3day", "day", "agenda"])(
    "switches to the %s view",
    (view) => {
      const handlers = createHandlers();

      expect(runCalendarPaletteCommand("setView", { view }, handlers)).toBe(
        true,
      );
      expect(handlers.setCalendarView).toHaveBeenCalledWith(view);
    },
  );

  it("ignores unknown views and unrelated actions", () => {
    const handlers = createHandlers();

    expect(
      runCalendarPaletteCommand("setView", { view: "year" }, handlers),
    ).toBe(false);
    expect(runCalendarPaletteCommand("newEvent", undefined, handlers)).toBe(
      false,
    );
    expect(handlers.setCalendarView).not.toHaveBeenCalled();
    expect(handlers.setCurrentDate).not.toHaveBeenCalled();
  });
});
