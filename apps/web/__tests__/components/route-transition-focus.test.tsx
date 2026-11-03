/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

let mockPathname = "/";
const mockPathListeners = new Set<() => void>();

jest.mock("next/navigation", () => ({
  usePathname: () =>
    jest.requireActual<typeof React>("react").useSyncExternalStore(
      (listener) => {
        mockPathListeners.add(listener);
        return () => mockPathListeners.delete(listener);
      },
      () => mockPathname,
    ),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@workspace/ui/components/ui", () => ({
  PageLoadingOverlay: () => null,
}));

import { RouteTransitionProvider } from "@/components/route-transition-provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function renderAt(pathname: string, page: React.ReactNode) {
  mockPathname = pathname;
  if (!root) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  const mounted = root;
  await act(async () => {
    mounted.render(<RouteTransitionProvider>{page}</RouteTransitionProvider>);
    for (const listener of mockPathListeners) listener();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe("RouteTransitionProvider focus", () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  it("moves focus to the new view's main after a client navigation drops it", async () => {
    await renderAt("/", <a href="/privacy">Privacy</a>);
    expect(document.activeElement).toBe(document.body);

    await renderAt("/privacy", <main>Privacy commitments</main>);
    const main = document.querySelector("main");
    expect(document.activeElement).toBe(main);
    expect(main?.getAttribute("tabindex")).toBe("-1");

    main?.blur();
    expect(main?.hasAttribute("tabindex")).toBe(false);
  });

  it("leaves focus where the new page already put it", async () => {
    await renderAt("/", <main>Home</main>);
    await renderAt(
      "/login",
      <main>
        <input aria-label="Email" autoFocus />
      </main>,
    );
    expect(document.activeElement).toBe(document.querySelector("input"));
  });
});
