/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { useEventEditorPopoverPosition } from "../../components/event-editor/use-event-editor-popover-position";

const anchorPosition = { x: 200, y: 200 };
function Popover({ open }: { open: boolean }) {
  const { position } = useEventEditorPopoverPosition({ anchorPosition, open });
  return <output>{position ? "positioned" : "unpositioned"}</output>;
}

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  jest.restoreAllMocks();
});

describe("event editor position lifetime", () => {
  it("keeps a reopened editor positioned when an old close microtask runs", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const pending: VoidFunction[] = [];
    jest
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((callback) => pending.push(callback));
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    jest
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => {
      root?.render(<Popover open={false} />);
    });
    expect(pending).toHaveLength(1);
    act(() => {
      root?.render(<Popover open />);
    });
    expect(container.textContent).toBe("positioned");
    act(() => {
      pending[0]?.();
    });
    expect(container.textContent).toBe("positioned");
  });
});
