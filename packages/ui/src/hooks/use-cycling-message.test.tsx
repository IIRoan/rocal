/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { useCyclingMessage } from "./use-cycling-message";
import { MESSAGE_CYCLE_CONFIG } from "../constants/loading-messages";

const activeMessages = ["Active one", "Active two"];
const pendingMessages = ["Pending one", "Pending two"];
const mockPendingRender = jest.fn();
const neverReady = new Promise<never>(() => undefined);
function Suspend(): React.ReactNode {
  mockPendingRender();
  throw neverReady;
}
function Message({ messages }: { messages: string[] }) {
  const { message } = useCyclingMessage({
    messages,
    initialDelay: 20,
    cycleInterval: 1000,
  });
  return <output>{message}</output>;
}
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("cycling message committed pool", () => {
  it("cycles the visible pool while an update to another pool is suspended", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const container = document.createElement("div");
    root = createRoot(container);
    const tree = (suspended: boolean) => (
      <React.Suspense fallback={null}>
        <Message messages={suspended ? pendingMessages : activeMessages} />
        {suspended ? <Suspend /> : null}
      </React.Suspense>
    );
    await act(async () => root?.render(tree(false)));
    await act(async () => {
      React.startTransition(() => root?.render(tree(true)));
    });
    expect(mockPendingRender).toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(
        20 + MESSAGE_CYCLE_CONFIG.TRANSITION_DURATION / 2,
      );
    });
    expect(activeMessages).toContain(container.textContent);
  });
});
