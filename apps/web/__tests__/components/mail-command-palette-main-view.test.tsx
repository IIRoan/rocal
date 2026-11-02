/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { Mail } from "lucide-react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));
jest.mock("../../hooks/use-settings", () => ({
  useSettings: () => ({ settings: { timezone: "Europe/Amsterdam" } }),
}));
jest.mock("../../hooks/use-user-time-format", () => ({
  useUserTimeFormat: () => "24h",
}));

import { MailCommandPaletteMainView } from "../../components/mail/mail-command-palette-main-view";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("MailCommandPaletteMainView", () => {
  it("exposes the search as a combobox whose active option follows the selection", () => {
    const render = (selectedIndex: number) =>
      act(() => {
        root.render(
          <MailCommandPaletteMainView
            query=""
            onQueryChange={() => {}}
            selectedIndex={selectedIndex}
            showUnifiedSearch={false}
            unifiedResults={[]}
            unifiedSearchLoading={false}
            mainListItems={[
              { id: "compose", label: "Compose", icon: Mail, description: "" },
              { id: "labels", label: "Labels", icon: Mail, description: "" },
            ]}
            onSelectItem={() => {}}
            onSelectUnifiedResult={() => {}}
          />,
        );
      });

    render(1);
    const input = container.querySelector("input");
    const listbox = container.querySelector('[role="listbox"]');
    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(input?.getAttribute("role")).toBe("combobox");
    expect(input?.getAttribute("aria-label")).toBe("Search mail and commands");
    expect(input?.getAttribute("aria-expanded")).toBe("true");
    expect(input?.getAttribute("aria-controls")).toBe(listbox?.id);
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
    ]);
    expect(options.every((option) => option.getAttribute("tabindex") === "-1")).toBe(true);
    expect(options.some((option) => option.hasAttribute("aria-current"))).toBe(false);
    expect(input?.getAttribute("aria-activedescendant")).toBe(options[1]?.id);

    render(0);
    expect(input?.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
  });
});
