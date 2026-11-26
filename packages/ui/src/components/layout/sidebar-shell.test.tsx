/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("../ui/blobatar-avatar", () => ({ BlobatarAvatar: () => <span /> }));

import { SidebarProvider } from "../ui/sidebar";
import { SidebarShell } from "./sidebar-shell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onCompose = jest.fn();

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia; // jsdom has no matchMedia; a desktop width is enough here.
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onCompose.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() =>
    root.render(
      <SidebarProvider>
        <SidebarShell
          activeApp="mail"
          user={{ name: "Sam Rivera", email: "sam@solace.onl" }}
          onOpenSearch={jest.fn()}
          onOpenSettings={jest.fn()}
          primaryAction={{ label: "Compose", icon: null, onClick: onCompose }}
        >
          {({ isCollapsed }) => <p>{isCollapsed ? "compact list" : "mailboxes"}</p>}
        </SidebarShell>
      </SidebarProvider>,
    ),
  );
}

const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const byText = (text: string) =>
  Array.from(container.querySelectorAll<HTMLElement>("button")).find((node) => node.textContent?.trim() === text);

it("puts the apps, search, settings and the account in the rail and the app's content in the panel", () => {
  render();
  expect(byLabel("Mail")?.getAttribute("aria-current")).toBe("page");
  expect(byLabel("Calendar")?.getAttribute("href")).toBe("/calendar");
  expect(byLabel("Search")).not.toBeNull();
  expect(byLabel("Settings")).not.toBeNull();
  expect(byLabel("Account menu, Sam Rivera")).not.toBeNull();
  expect(container.textContent).toContain("mailboxes");
  act(() => byText("Compose")?.click());
  expect(onCompose).toHaveBeenCalledTimes(1);
});

it("collapses to the rail, which keeps the primary action and the compact list", () => {
  render();
  act(() => byLabel("Collapse sidebar")?.click());
  expect(byText("Compose")).toBeUndefined();
  act(() => byLabel("Compose")?.click());
  expect(onCompose).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("compact list");
  expect(byLabel("Expand sidebar")).not.toBeNull();
});
