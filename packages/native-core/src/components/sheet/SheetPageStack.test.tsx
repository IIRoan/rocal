/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSheetPageStack, type SheetPageStackState } from "./SheetPageStack";

jest.mock("react-native", () => ({
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: () => null,
  View: () => null,
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {},
  GestureDetector: () => null,
}));

jest.mock("react-native-reanimated", () => {
  const { useRef } = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: { View: () => null },
    Easing: { out: () => () => 0, cubic: () => 0 },
    cancelAnimation: jest.fn(),
    clamp: (value: number) => value,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: number) => useRef({ value: initial }).current,
    withTiming: (target: number) => target,
  };
});

jest.mock("react-native-worklets", () => ({ scheduleOnRN: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("../../providers/ThemeProvider", () => ({ useTheme: () => ({ theme: {} }) }));
jest.mock("../BottomSheet", () => ({
  SheetScrollFocusProvider: ({ children }: { children: React.ReactNode }) => children,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let stack: SheetPageStackState | null = null;

function Harness({ onRender }: { onRender: (state: SheetPageStackState) => void }) {
  const state = useSheetPageStack("root", true);
  useEffect(() => onRender(state));
  return null;
}

function capture(state: SheetPageStackState) {
  stack = state;
}

function current(): SheetPageStackState {
  if (!stack) throw new Error("Harness has not rendered");
  return stack;
}

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<Harness onRender={capture} />));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useSheetPageStack", () => {
  it("mounts a pushed page off-screen and slides only once it has painted", async () => {
    act(() => current().push("details"));
    expect(current().topIndex).toBe(1);
    expect(current().position.value).toBe(0);

    await nextFrame();
    expect(current().position.value).toBe(0);

    await nextFrame();
    expect(current().position.value).toBe(1);
  });

  it("drops a pending slide when the stack resets first", async () => {
    act(() => current().push("details"));
    act(() => current().reset());

    await nextFrame();
    await nextFrame();
    expect(current().topIndex).toBe(0);
    expect(current().position.value).toBe(0);
  });
});
