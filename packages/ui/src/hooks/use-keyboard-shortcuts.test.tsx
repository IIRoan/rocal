/** @jest-environment node */

import React from "react";
import { describe, expect, it } from "@jest/globals";
import { renderToString } from "react-dom/server";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

function Shortcuts() {
  useKeyboardShortcuts([{ key: "k", action: () => undefined }]);
  return <span>Ready</span>;
}

describe("keyboard shortcuts during server rendering", () => {
  it("renders without accessing a browser document", () => {
    expect(typeof document).toBe("undefined");
    expect(renderToString(<Shortcuts />)).toBe("<span>Ready</span>");
  });
});
