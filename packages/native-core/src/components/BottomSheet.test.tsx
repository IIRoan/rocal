/** @jest-environment jsdom */

import React, { act, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Text,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type TextInputInstance,
} from "react-native";
import type { BottomSheetProps as GorhomProps } from "@gorhom/bottom-sheet";
import {
  BottomSheet,
  BottomSheetScrollView,
  SheetScrollFocusProvider,
  type BottomSheetHandle,
} from "./BottomSheet";
import { SheetSearchField, SheetTextField } from "./sheet/SheetSections";

let mockSheetProps: GorhomProps;
let mockScrollProps: ScrollViewProps;
const mockRegisterScroll = jest.fn();
const mockUnregisterScroll = jest.fn();
const mockRegisterView = jest.fn();
const mockForceClose = jest.fn();
const mockSnapToIndex = jest.fn();
const mockKeyboardFocus = jest.fn();
const mockKeyboardBlur = jest.fn();
let mockInsideSheet = true;
let mockInputProps: TextInputProps & { ref?: Ref<TextInputInstance> };
const mockInternal = {
  animatedLayoutState: {
    get: () => ({ containerHeight: 800, handleHeight: 28 }),
  },
  animatedPosition: { get: () => 100 },
  animatedSheetHeight: { get: () => 700 },
  animatedKeyboardState: {
    get: () => ({ status: 2, heightWithinContainer: 0 }),
  },
  animatedAnimationState: { get: () => ({ status: 2 }) },
  animatedContentGestureState: { get: () => 0 },
  animatedHandleGestureState: { get: () => 0 },
};

jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Keyboard: {
    metrics: () => undefined,
    dismiss: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: "ios" },
  StyleSheet: {
    create: (styles: object) => styles,
    absoluteFill: {},
    hairlineWidth: 1,
  },
  Text: ({ children }: { children?: ReactNode }) => children,
  TextInput: (props: TextInputProps) => {
    mockInputProps = props;
    return <input aria-label={props.accessibilityLabel} />;
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
  useSharedValue: (initial: number) => {
    let value = initial;
    return { get: () => value, set: (next: number) => (value = next) };
  },
  useAnimatedReaction: <T,>(
    prepare: () => T,
    react: (value: T) => void,
  ) => react(prepare()),
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: function MockGorhomSheet(
    props: GorhomProps & { ref?: React.Ref<unknown> },
  ) {
    const { useImperativeHandle } = jest.requireActual<typeof React>("react");
    useImperativeHandle(props.ref, () => ({
      forceClose: mockForceClose,
      snapToIndex: mockSnapToIndex,
    }));
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
  BottomSheetTextInput: (props: TextInputProps) => {
    mockInputProps = props;
    return (
      <input
        aria-label={props.accessibilityLabel}
        onFocus={mockKeyboardFocus}
        onBlur={mockKeyboardBlur}
      />
    );
  },
  useBottomSheetInternal: () => (mockInsideSheet ? mockInternal : null),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  jest.clearAllMocks();
  mockInsideSheet = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it.each(["name", "search"])(
  "registers keyboard focus for the drawer %s field",
  async (kind) => {
    const change = jest.fn();
    const inputRef = React.createRef<TextInputInstance>();
    const field =
      kind === "name" ? (
        <SheetTextField
          accessibilityLabel="Mailbox name"
          value="Maestro folder"
          onChangeText={change}
          autoFocus
        />
      ) : (
        <SheetSearchField
          accessibilityLabel="Search mailboxes"
          value="Maestro folder"
          onChangeText={change}
          inputRef={inputRef}
        />
      );
    await act(async () => root.render(field));
    const input = container.querySelector("input");
    if (!input) throw new Error("Missing drawer field");
    act(() => input.focus());
    expect(mockKeyboardFocus).toHaveBeenCalledTimes(1);
    expect(mockInputProps.value).toBe("Maestro folder");
    if (kind === "search") expect(mockInputProps.ref).toBe(inputRef);
    act(() => mockInputProps.onChangeText?.("Renamed folder"));
    expect(change).toHaveBeenCalledWith("Renamed folder");
    act(() => input.blur());
    expect(mockKeyboardBlur).toHaveBeenCalledTimes(1);
  },
);

it("keeps the shared text field usable outside a drawer", async () => {
  mockInsideSheet = false;
  await act(async () =>
    root.render(
      <SheetTextField accessibilityLabel="Account name" value="Maestro" />,
    ),
  );
  const input = container.querySelector("input");
  if (!input) throw new Error("Missing standalone field");
  act(() => input.focus());
  expect(mockInputProps.value).toBe("Maestro");
  expect(mockKeyboardFocus).not.toHaveBeenCalled();
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
            <BottomSheetScrollView>
              <View />
            </BottomSheetScrollView>
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
        <View />
      </BottomSheet>,
    );
  });
  expect(mockSheetProps.enableHandlePanningGesture ?? true).toBe(true);
  expect(mockSheetProps.enablePanDownToClose).toBe(true);
  act(() => mockSheetProps.onClose?.());
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("slides out on a tap close and unmounts once Gorhom settles, but drops a swiped-away sheet at once", async () => {
  const onCloseComplete = jest.fn();
  const renderSheet = (visible: boolean) =>
    act(async () => {
      root.render(
        <BottomSheet
          visible={visible}
          onDismiss={jest.fn()}
          onCloseComplete={onCloseComplete}
        >
          <Text>Sheet body</Text>
        </BottomSheet>,
      );
    });
  await renderSheet(true);
  await renderSheet(false);
  expect(mockForceClose).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe("Sheet body");
  expect(onCloseComplete).not.toHaveBeenCalled();
  act(() => mockSheetProps.onClose?.());
  expect(container.textContent).toBe("");
  expect(onCloseComplete).toHaveBeenCalledTimes(1);

  await renderSheet(true);
  act(() => mockSheetProps.onClose?.());
  await renderSheet(false);
  expect(container.textContent).toBe("");
  expect(mockForceClose).toHaveBeenCalledTimes(1);
  expect(onCloseComplete).toHaveBeenCalledTimes(2);
});

it("slides out again after a swiped-away sheet is snapped back open", async () => {
  const sheetRef = React.createRef<BottomSheetHandle>();
  const renderSheet = (visible: boolean) =>
    act(async () => {
      root.render(
        <BottomSheet ref={sheetRef} visible={visible} onDismiss={jest.fn()}>
          <Text>Sheet body</Text>
        </BottomSheet>,
      );
    });
  await renderSheet(true);
  act(() => mockSheetProps.onClose?.());
  act(() => sheetRef.current?.snapTo(0));
  expect(mockSnapToIndex).toHaveBeenCalledWith(0);

  await renderSheet(false);
  expect(mockForceClose).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe("Sheet body");
});

it("leaves the controls inside the sheet reachable by VoiceOver", async () => {
  await act(async () => {
    root.render(
      <BottomSheet visible onDismiss={jest.fn()}>
        <View />
      </BottomSheet>,
    );
  });
  expect(mockSheetProps.accessible).toBe(false);
});

it("registers the back handler once per open even when onDismiss changes", async () => {
  const { BackHandler } = jest.requireMock<typeof import("react-native")>(
    "react-native",
  );
  const latestDismiss = jest.fn();
  for (const onDismiss of [jest.fn(), jest.fn(), latestDismiss]) {
    await act(async () => {
      root.render(
        <BottomSheet visible onDismiss={onDismiss}>
          <View />
        </BottomSheet>,
      );
    });
  }
  const addListener = BackHandler.addEventListener as jest.Mock;
  expect(addListener).toHaveBeenCalledTimes(1);
  act(() => addListener.mock.calls[0][1]());
  expect(latestDismiss).toHaveBeenCalledTimes(1);
});
