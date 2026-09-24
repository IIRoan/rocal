import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import {
  createSourceFile,
  forEachChild,
  isArrowFunction,
  isCallExpression,
  isVariableDeclaration,
  JsxEmit,
  ModuleKind,
  type Node,
  ScriptTarget,
  transpileModule,
} from "typescript";

const kitRoot = dirname(require.resolve("@howljs/calendar-kit/package.json"));

type LayoutStyle = {
  position?: string;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

describe("calendar-kit all-day event layout on React Native 0.86", () => {
  it.each([
    "src/components/MultiDayBarItem.tsx",
    "lib/commonjs/components/MultiDayBarItem.js",
    "lib/module/components/MultiDayBarItem.js",
  ])("stretches the event content to its allocated bounds in %s", (entry) => {
    const source = readFileSync(resolve(kitRoot, entry), "utf8");
    const { outputText } = transpileModule(source, {
      fileName: entry,
      compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React },
    });
    let eventContent: LayoutStyle | undefined;
    const absoluteFill: LayoutStyle = {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };

    runInNewContext(outputText, {
      exports: {},
      require: (name: string) => {
        if (name !== "react-native") return {};
        return {
          StyleSheet: {
            absoluteFill,
            create: (styles: Record<string, LayoutStyle>) => {
              eventContent = styles.eventContent;
              return styles;
            },
          },
        };
      },
    });

    expect(eventContent).toEqual(expect.objectContaining(absoluteFill));
  });
});

describe.each([
  "src/CalendarHeader.tsx",
  "lib/commonjs/CalendarHeader.js",
  "lib/module/CalendarHeader.js",
])("all-day footer spacing in %s", (entry) => {
  const source = createSourceFile(
    entry,
    readFileSync(resolve(kitRoot, entry), "utf8"),
    ScriptTarget.Latest,
    true,
  );
  let calculateHeight = "";

  function findHeightCalculation(node: Node): void {
    if (
      isVariableDeclaration(node) &&
      node.name.getText(source) === "allDayEventsHeight" &&
      node.initializer &&
      isCallExpression(node.initializer)
    ) {
      const calculation = node.initializer.arguments[0];
      if (calculation && isArrowFunction(calculation)) {
        calculateHeight = calculation.getText(source);
      }
    }
    forEachChild(node, findHeightCalculation);
  }

  findHeightCalculation(source);

  it.each([
    { rows: 0, overflow: false, expanded: false, expected: 0 },
    { rows: 1, overflow: false, expanded: false, expected: 32 },
    { rows: 2, overflow: false, expanded: false, expected: 64 },
    { rows: 2, overflow: true, expanded: false, expected: 84 },
    { rows: 3, overflow: true, expanded: true, expected: 96 },
    { rows: 5, overflow: true, expanded: true, expected: 160 },
  ])(
    "reserves only occupied space: $rows rows, overflow=$overflow, expanded=$expanded",
    ({ rows, overflow, expanded, expected }) => {
      expect(calculateHeight).not.toBe("");
      const height: unknown = runInNewContext(`(${calculateHeight})()`, {
        numberOfDays: 3,
        headerBottomHeight: 20,
        visibleRows: { value: rows },
        eventHeight: { value: 32 },
        isShowExpandButton: { value: overflow },
        isExpanded: { value: expanded },
      });

      expect(height).toBe(expected);
    },
  );
});
