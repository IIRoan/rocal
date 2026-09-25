/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  CommandPaletteProvider,
  useCommandPalette,
} from "./CommandPaletteProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("CommandPaletteProvider", () => {
  it("throws when useCommandPalette is used outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      useCommandPalette();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      /must be used within a CommandPaletteProvider/,
    );
    spy.mockRestore();
  });

  it("starts closed and supports open, close and toggle", () => {
    let api: ReturnType<typeof useCommandPalette> | null = null;
    function Consumer() {
      api = useCommandPalette();
      return null;
    }

    render(
      <CommandPaletteProvider>
        <Consumer />
      </CommandPaletteProvider>,
    );

    expect(api!.isOpen).toBe(false);

    act(() => api!.open());
    expect(api!.isOpen).toBe(true);

    act(() => api!.close());
    expect(api!.isOpen).toBe(false);

    act(() => api!.toggle());
    expect(api!.isOpen).toBe(true);

    act(() => api!.toggle());
    expect(api!.isOpen).toBe(false);
  });

  it("keeps the open/close/toggle callbacks referentially stable across renders", () => {
    const seen: ReturnType<typeof useCommandPalette>[] = [];
    function Consumer() {
      seen.push(useCommandPalette());
      return null;
    }

    render(
      <CommandPaletteProvider>
        <Consumer />
      </CommandPaletteProvider>,
    );

    act(() => seen[seen.length - 1].open());

    const first = seen[0];
    const latest = seen[seen.length - 1];
    expect(latest.open).toBe(first.open);
    expect(latest.close).toBe(first.close);
    expect(latest.toggle).toBe(first.toggle);
  });
});
