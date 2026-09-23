/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ScrollViewProps } from "react-native";
import type { BottomSheetProps as GorhomProps } from "@gorhom/bottom-sheet";
import {
  BottomSheet,
  BottomSheetScrollView,
  SheetScrollFocusProvider,
} from "./BottomSheet";

let mockSheetProps: GorhomProps;
let mockScrollProps: ScrollViewProps;
const mockRegisterScroll = jest.fn();
const mockUnregisterScroll = jest.fn();
const mockRegisterView = jest.fn();
const mockInternal = {
  animatedLayoutState: {
    get: () => ({ containerHeight: 800, handleHeight: 28 }),
  },
  animatedPosition: { get: () => 100 },
  animatedSheetHeight: { get: () => 700 },
  animatedKeyboardState: {
    get: () => ({ status: 2, heightWithinContainer: 0 }),
  },
};

jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Keyboard: {
    dismiss: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: "ios" },
  StyleSheet: {
    create: (styles: object) => styles,
    absoluteFill: {},
    hairlineWidth: 1,
  },
  View: ({ children }: { children?: ReactNode }) => children,
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("react-native-gesture-handler", () => ({
  ScrollView: (props: ScrollViewProps) => {
    mockScrollProps = props;
    return <div data-testid="native-scroll">{props.children}</div>;
  },
}));

jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual("@workspace/design-tokens").nativeLightTheme,
    isDark: false,
  }),
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: ({ children }: { children?: ReactNode }) => children },
  Easing: { out: (easing: unknown) => easing, cubic: jest.fn() },
  useAnimatedStyle: (compute: () => object) => compute(),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: (props: GorhomProps) => {
    mockSheetProps = props;
    return props.children;
  },
  BottomSheetView: () => {
    mockRegisterView();
    return null;
  },
  BottomSheetScrollView: (
    props: ScrollViewProps & {
      focusHook: (effect: () => () => void) => void;
    },
  ) => {
    const { useCallback } = jest.requireActual<typeof React>("react");
    const register = useCallback(() => {
      mockRegisterScroll();
      return mockUnregisterScroll;
    }, []);
    props.focusHook(register);
    mockScrollProps = props;
    return <div data-testid="gorhom-scroll">{props.children}</div>;
  },
  useBottomSheetInternal: () => mockInternal,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

it("keeps Gorhom scrolling and content dragging across drawer rerenders", async () => {
  const onScroll = jest.fn();
  const renderSheet = async (label: string) => {
    await act(async () => {
      root.render(
        <BottomSheet visible onDismiss={jest.fn()}>
          <BottomSheetScrollView onScroll={onScroll}>
            {label}
          </BottomSheetScrollView>
        </BottomSheet>,
      );
    });
  };
  await renderSheet("Settings");
  const scrollView = container.querySelector('[data-testid="gorhom-scroll"]');
  expect(scrollView).not.toBeNull();
  if (!scrollView) throw new Error("Missing Gorhom scroll view");
  scrollView.scrollTop = 700;
  await renderSheet("Updated settings");
  expect(container.querySelector('[data-testid="gorhom-scroll"]')).toBe(
    scrollView,
  );
  expect(scrollView.scrollTop).toBe(700);
  expect(mockScrollProps.onScroll).toBe(onScroll);
  expect(mockSheetProps.enableContentPanningGesture).toBe(true);
  expect(mockRegisterScroll).toHaveBeenCalledTimes(1);
  expect(mockRegisterView).not.toHaveBeenCalled();
});

it("registers only the focused page with Gorhom and restores it after navigating back", async () => {
  const renderPage = async (focused: boolean) => {
    await act(async () => {
      root.render(
        <BottomSheet visible onDismiss={jest.fn()}>
          <SheetScrollFocusProvider focused={focused}>
            <BottomSheetScrollView>Settings</BottomSheetScrollView>
          </SheetScrollFocusProvider>
        </BottomSheet>,
      );
    });
  };
  await renderPage(false);
  expect(mockRegisterScroll).not.toHaveBeenCalled();
  await renderPage(true);
  expect(mockRegisterScroll).toHaveBeenCalledTimes(1);
  await renderPage(false);
  expect(mockUnregisterScroll).toHaveBeenCalledTimes(1);
  await renderPage(true);
  expect(mockRegisterScroll).toHaveBeenCalledTimes(2);
});

it("retains handle dragging and swipe-down dismissal", async () => {
  const onDismiss = jest.fn();
  await act(async () => {
    root.render(
      <BottomSheet visible onDismiss={onDismiss}>
        Content
      </BottomSheet>,
    );
  });
  expect(mockSheetProps.enableHandlePanningGesture ?? true).toBe(true);
  expect(mockSheetProps.enablePanDownToClose).toBe(true);
  act(() => mockSheetProps.onClose?.());
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
