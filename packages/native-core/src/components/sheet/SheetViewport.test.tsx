/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SheetViewport } from "./SheetViewport";

let mockPlatform = "android";
let mockHeight = 0;
let mockKeyboardChange = (_event: {
  endCoordinates: { screenY: number };
}) => {};
let mockStyleUpdate = () => {};
let mockLayout = {
  containerHeight: 800,
  containerOffset: { top: 0 },
  handleHeight: 28,
};
let mockKeyboard = { status: 1, height: 300, heightWithinContainer: 0 };

jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
  Keyboard: {
    metrics: () => ({ screenY: 500 }),
    addListener: (_name: string, listener: typeof mockKeyboardChange) => {
      mockKeyboardChange = listener;
      return { remove: jest.fn() };
    },
  },
  StyleSheet: { create: (styles: object) => styles },
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  useBottomSheetInternal: () => ({
    animatedLayoutState: { get: () => mockLayout },
    animatedPosition: { get: () => 100 },
    animatedSheetHeight: { get: () => 700 },
    animatedKeyboardState: { get: () => mockKeyboard },
    animatedAnimationState: { get: () => ({ status: 2 }) },
    animatedContentGestureState: { get: () => 0 },
    animatedHandleGestureState: { get: () => 0 },
  }),
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: ({
      children,
      style,
    }: {
      children?: ReactNode;
      style: [object, { height: number }];
    }) => {
      mockHeight = style[1].height;
      return children;
    },
  },
  useAnimatedStyle: (compute: () => { height: number }) => {
    mockStyleUpdate = () => {
      mockHeight = compute().height;
    };
    return compute();
  },
  useAnimatedReaction: <T,>(prepare: () => T, react: (next: T) => void) =>
    react(prepare()),
  useSharedValue: (initial: number) => {
    let value = initial;
    return {
      get: () => value,
      set: (next: number) => {
        value = next;
        mockStyleUpdate();
      },
    };
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

beforeEach(() => {
  mockPlatform = "android";
  mockStyleUpdate = () => {};
  mockLayout = {
    containerHeight: 800,
    containerOffset: { top: 0 },
    handleHeight: 28,
  };
  mockKeyboard = { status: 1, height: 300, heightWithinContainer: 0 };
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

it.each([
  ["Android edge-to-edge", "android", 800, 0, 1, 0, 372],
  ["Android resized window", "android", 500, 0, 1, 0, 372],
  ["Android inset container", "android", 700, 100, 1, 0, 272],
  ["Android container above keyboard", "android", 400, 50, 1, 0, 272],
  ["Android hidden keyboard", "android", 800, 0, 2, 0, 672],
  ["iOS shown keyboard", "ios", 800, 0, 1, 300, 372],
  ["iOS hidden keyboard", "ios", 800, 0, 2, 300, 672],
] as const)(
  "keeps the last row reachable with %s",
  async (
    _name,
    platform,
    containerHeight,
    top,
    status,
    heightWithinContainer,
    expected,
  ) => {
    mockPlatform = platform;
    mockLayout = {
      containerHeight,
      containerOffset: { top },
      handleHeight: 28,
    };
    mockKeyboard = { status, height: 300, heightWithinContainer };
    await act(async () => root.render(<SheetViewport>Form</SheetViewport>));
    expect(mockHeight).toBe(expected);
  },
);

it("updates overlap when the keyboard moves on screen", async () => {
  await act(async () => root.render(<SheetViewport>Form</SheetViewport>));
  act(() => mockKeyboardChange({ endCoordinates: { screenY: 700 } }));
  expect(mockHeight).toBe(572);
});
