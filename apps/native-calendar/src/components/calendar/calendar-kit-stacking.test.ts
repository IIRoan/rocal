import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import type {
  EventItemInternal,
  PackedAllDayEvent,
} from "@howljs/calendar-kit";
import {
  createSourceFile,
  forEachChild,
  isVariableDeclaration,
  JsxEmit,
  ModuleKind,
  type Node,
  ScriptTarget,
  transpileModule,
} from "typescript";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const { populateAllDayEvents } = jest.requireActual<
  typeof import("@howljs/calendar-kit/lib/typescript/utils/eventUtils")
>("@howljs/calendar-kit/lib/commonjs/utils/eventUtils");

const kitRoot = dirname(require.resolve("@howljs/calendar-kit/package.json"));
const days = Array.from({ length: 7 }, (_, day) =>
  new Date(2026, 8, 21 + day).getTime(),
);

function makeEvent(id: string, first = 0, last = first): EventItemInternal {
  return {
    id,
    localId: id,
    title: id,
    start: { date: `2026-09-${21 + first}` },
    end: { date: `2026-09-${21 + last}` },
    _internal: {
      startUnix: days[first],
      endUnix: new Date(2026, 8, 22 + last).getTime() - 1,
      duration: (last - first + 1) * 1440,
    },
  };
}

function pack(events: EventItemInternal[], count: number) {
  return populateAllDayEvents(events, {
    startDate: days[0],
    endDate: days[count - 1],
    visibleDays: days.slice(0, count),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

it.each([1, 3, 7])(
  "stacks five overlapping events in a %s-day layout",
  (count) => {
    const { packedEvents, maxRowCount } = pack(
      Array.from({ length: 5 }, (_, index) => makeEvent(`event-${index}`)),
      count,
    );

    expect(maxRowCount).toBe(5);
    expect(packedEvents.map((event) => event._internal.rowIndex)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(
      packedEvents.every((event) => event._internal.columnSpan === 1),
    ).toBe(true);
  },
);

it("stacks events beneath a multi-day span and reuses rows on separate days", () => {
  const { packedEvents, maxRowCount } = pack(
    [
      makeEvent("trip", 0, 2),
      makeEvent("first", 0),
      makeEvent("second", 1),
      makeEvent("third", 2),
    ],
    3,
  );

  expect(maxRowCount).toBe(2);
  const trip = packedEvents.find((event) => event.id === "trip");
  expect(trip?._internal.columnSpan).toBe(3);
  const otherRows = packedEvents
    .filter((event) => event.id !== "trip")
    .map((event) => event._internal.rowIndex);
  expect(new Set(otherRows).size).toBe(1);
  expect(otherRows).not.toContain(trip?._internal.rowIndex);
});

it.each([
  "src/components/SingleDayBarItem.tsx",
  "lib/commonjs/components/SingleDayBarItem.js",
  "lib/module/components/SingleDayBarItem.js",
])(
  "packs day-view cards consecutively instead of keeping week rows in %s",
  (entry) => {
    const source = createSourceFile(
      entry,
      readFileSync(resolve(kitRoot, entry), "utf8"),
      ScriptTarget.Latest,
      true,
    );
    let renderer = "";
    function findRenderer(node: Node): void {
      if (
        isVariableDeclaration(node) &&
        node.name.getText(source) === "_renderEvent" &&
        node.initializer
      ) {
        renderer = node.initializer.getText(source);
      }
      forEachChild(node, findRenderer);
    }
    findRenderer(source);
    expect(renderer).not.toBe("");
    const { outputText } = transpileModule(
      `const render = ${renderer}; render(event, rowIndex);`,
      {
        fileName: "renderer.tsx",
        compilerOptions: { jsx: JsxEmit.React, module: ModuleKind.CommonJS },
      },
    );
    const { packedEvents } = pack(
      Array.from({ length: 5 }, (_, index) => makeEvent(`event-${index}`)),
      7,
    );

    packedEvents.slice(3).forEach((event, rowIndex) => {
      const result: { props: { event: PackedAllDayEvent } } = runInNewContext(
        outputText,
        {
          React: { createElement },
          _react: { default: { createElement } },
          EventItem: "EventItem",
          event,
          rowIndex,
          onPressEvent: jest.fn(),
          renderEvent: undefined,
        },
      );
      expect(result.props.event._internal.rowIndex).toBe(rowIndex);
      expect(result.props.event.id).toBe(event.id);
      expect(event._internal.rowIndex).toBe(rowIndex + 3);
    });
  },
);
