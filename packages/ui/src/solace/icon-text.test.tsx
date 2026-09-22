/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot } from "react-dom/client";

import { IconText } from "./icon-text";
import { Icon } from "./icons.constants";

jest.mock("./warm-tooltip.css", () => ({}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderButton(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container.querySelector("button");
}

describe("IconText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names icon-only buttons from their tooltip", () => {
    const button = renderButton(
      <IconText startIcon={Icon.Search} tooltip="Search" onClick={() => {}} />,
    );
    expect(button?.getAttribute("aria-label")).toBe("Search");
  });

  it("does not override a visible label", () => {
    const button = renderButton(
      <IconText label="Refresh" tooltip="Reload" onClick={() => {}} />,
    );
    expect(button?.hasAttribute("aria-label")).toBe(false);
  });
});
