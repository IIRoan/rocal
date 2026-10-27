/** @jest-environment jsdom */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot } from "react-dom/client";

import { SolaceTheme } from "./solace-theme";

jest.mock("@workspace/ui/solace/theme.css", () => ({}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderRoot(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container.querySelector("[data-solace]");
}

describe("SolaceTheme", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("themes the whole document by default and only its subtree when scoped", () => {
    expect(
      renderRoot(<SolaceTheme>mail</SolaceTheme>)?.hasAttribute(
        "data-solace-scoped",
      ),
    ).toBe(false);
    expect(
      renderRoot(<SolaceTheme scoped>preview</SolaceTheme>)?.hasAttribute(
        "data-solace-scoped",
      ),
    ).toBe(true);
  });

  it("keeps every document-wide rule from matching a scoped root", () => {
    const css = readFileSync(join(__dirname, "theme.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const documentRules = css.split(":has(").slice(1);

    expect(documentRules.length).toBeGreaterThan(0);
    for (const rule of documentRules) {
      expect(
        rule.startsWith("[data-solace]:not([data-solace-scoped]))"),
      ).toBe(true);
    }
  });
});
