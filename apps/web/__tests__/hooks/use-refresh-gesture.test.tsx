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
import { useRefreshGesture } from "@/hooks/use-refresh-gesture";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function RefreshHarness({
  enabled,
  onRefresh,
}: {
  enabled?: boolean;
  onRefresh: () => void;
}) {
  useRefreshGesture({ enabled, onRefresh });
  return <div data-mail-list-scroll style={{ height: 200, overflow: "auto" }} />;
}

describe("useRefreshGesture", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("triggers refresh on F5", async () => {
    const onRefresh = jest.fn();

    await act(async () => {
      root.render(<RefreshHarness onRefresh={onRefresh} />);
    });

    const event = new KeyboardEvent("keydown", {
      key: "F5",
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("triggers refresh on Cmd+R", async () => {
    const onRefresh = jest.fn();

    await act(async () => {
      root.render(<RefreshHarness onRefresh={onRefresh} />);
    });

    const event = new KeyboardEvent("keydown", {
      key: "r",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not trigger refresh when disabled", async () => {
    const onRefresh = jest.fn();

    await act(async () => {
      root.render(<RefreshHarness enabled={false} onRefresh={onRefresh} />);
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F5",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
