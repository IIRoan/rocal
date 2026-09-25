import { createElement, Fragment } from "react";
import {
  SHEET_CHROME_DISPLAY_NAMES,
  isSheetContentPanTarget,
  splitSheetChildren,
} from "./sheet-children";

function named(displayName: string) {
  function Child() {
    return null;
  }
  Child.displayName = displayName;
  return Child;
}

const Header = named("BottomSheetHeader");
const Footer = named("BottomSheetFooter");
const Body = named("EventBody");

describe("splitSheetChildren", () => {
  it("lifts header and footer out of the body so chrome is not a pan target", () => {
    const tree = createElement(
      Fragment,
      null,
      createElement(Header, null, "Title"),
      createElement(Body, null, "Details"),
      createElement(Footer, null, "Actions"),
    );

    const { body, footer, header } = splitSheetChildren(tree);

    expect(header).toMatchObject({ type: Header });
    expect(footer).toMatchObject({ type: Footer });
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ type: Body });
    expect(isSheetContentPanTarget(header)).toBe(false);
    expect(isSheetContentPanTarget(footer)).toBe(false);
    expect(isSheetContentPanTarget(body[0])).toBe(true);
  });

  it("treats only header and footer as sheet chrome", () => {
    expect(SHEET_CHROME_DISPLAY_NAMES).toEqual([
      "BottomSheetHeader",
      "BottomSheetFooter",
    ]);
  });
});
