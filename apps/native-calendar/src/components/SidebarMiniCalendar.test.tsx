/** @jest-environment jsdom */

import React, { act, startTransition, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { cancelAnimation } from "react-native-reanimated";
import { utcToPickerDate } from "@workspace/calendar-core";
import { SidebarMiniCalendar } from "./SidebarMiniCalendar";

const mockToday = new Date();
const selectedDate = utcToPickerDate(mockToday, "Europe/Amsterdam");
const mockPending = new Promise(() => undefined);
let mockSuspend = false;

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  Gesture: {
    Pan: () => {
      const gesture = {
        activeOffsetX: () => gesture,
        failOffsetY: () => gesture,
        onBegin: () => gesture,
        onUpdate: () => gesture,
        onEnd: () => gesture,
      };
      return gesture;
    },
  },
}));
jest.mock("react-native-reanimated", () => {
  const { useState } = jest.requireActual<typeof React>("react");
  return {
    __esModule: true,
    default: {
      View: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
      ),
    },
    cancelAnimation: jest.fn(),
    withSpring: (value: number) => value,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: number) =>
      useState(() => ({
        value: initial,
        get() {
          return this.value;
        },
        set(value: number) {
          this.value = value;
        },
      }))[0],
  };
});
jest.mock("react-native-worklets", () => ({ scheduleOnRN: jest.fn() }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual<typeof import("@workspace/design-tokens")>(
      "@workspace/design-tokens",
    ).nativeLightTheme,
  }),
}));
jest.mock("./calendar/useCurrentDateTime", () => ({
  useCurrentDateTime: () => mockToday,
}));
jest.mock("../hooks/use-calendar-management", () => ({
  useCalendars: () => ({ data: [] }),
}));
jest.mock("../hooks/use-mini-calendar-pages", () => ({
  useMiniCalendarPages: ({ committedIndex }: { committedIndex: number }) => {
    if (mockSuspend && committedIndex === 1) throw mockPending;
    return { pages: [], windowStartIndex: 0 };
  },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps Today navigation tied to the visible month during an abandoned render", async () => {
  jest.mocked(cancelAnimation).mockClear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const onDayPress = jest.fn();
  try {
    await act(async () =>
      root.render(
        <Suspense fallback="Loading">
          <SidebarMiniCalendar
            selectedDate={selectedDate}
            onDayPress={onDayPress}
            timezone="Europe/Amsterdam"
          />
        </Suspense>,
      ),
    );
    mockSuspend = true;
    await act(async () =>
      startTransition(() =>
        container
          .querySelector<HTMLButtonElement>('[aria-label="Next month"]')
          ?.click(),
      ),
    );
    expect(container.textContent).toContain(
      selectedDate.toLocaleString("en-US", { month: "long" }),
    );
    expect(cancelAnimation).toHaveBeenCalledTimes(1);

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Go to today"]')
        ?.click(),
    );

    expect(onDayPress).toHaveBeenCalledTimes(1);
    expect(cancelAnimation).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    mockSuspend = false;
  }
});
