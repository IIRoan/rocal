import { getBottomSheetViewportHeight } from "./bottom-sheet-layout";

describe("drawer viewport", () => {
  it.each([
    ["expanded", 800, 100, 700, 28, 0, 672],
    ["lower snap", 800, 400, 700, 28, 0, 372],
    ["keyboard covering the bottom", 800, 0, 700, 28, 300, 472],
    ["short sheet above the keyboard", 800, 200, 400, 28, 200, 372],
    ["closed", 800, 800, 700, 28, 0, 0],
    ["unmeasured", -999, 800, 0, -999, 0, 0],
  ])(
    "bounds content to the visible area when %s",
    (_label, container, position, sheet, handle, keyboard, expected) => {
      expect(
        getBottomSheetViewportHeight(
          container,
          position,
          sheet,
          handle,
          keyboard,
        ),
      ).toBe(expected);
    },
  );

  it("keeps the last row reachable above a fixed header and footer at a lower snap", () => {
    const viewport = getBottomSheetViewportHeight(800, 400, 700, 28, 0);
    const header = 48;
    const footer = 80;
    const scrollHeight = viewport - header - footer;
    const contentHeight = 1200;
    const bottomOffset = contentHeight - scrollHeight;
    expect(header + contentHeight - bottomOffset).toBe(viewport - footer);
    expect(scrollHeight).toBe(244);
  });
});
