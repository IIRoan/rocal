/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MailSwipeAction } from "@workspace/calendar-core";
import {
  resolveMailSwipeAccessibilityActions,
  resolveMailSwipeSpec,
  type MailSwipeHandlers,
  type MailSwipeRowState,
} from "../../lib/mail/mail-swipe-actions";
import { MailSwipeRow } from "./MailSwipeRow";

type A11yProps = {
  accessibilityActions?: { name: string; label: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
  children?: ReactNode;
};

const mockRowProps: { current: A11yProps | null } = { current: null };

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("react-native-reanimated", () => {
  const AnimatedView = (props: A11yProps) => {
    if (props.accessibilityActions) mockRowProps.current = props;
    return <div>{props.children}</div>;
  };
  return {
    __esModule: true,
    default: { View: AnimatedView },
    Extrapolation: { CLAMP: "clamp" },
    interpolate: () => 0,
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ get: () => value, set: () => undefined }),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});
jest.mock("react-native-gesture-handler", () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
jest.mock("react-native-worklets", () => ({ scheduleOnRN: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { colors: {} } }),
}));

const row: MailSwipeRowState = { ids: ["a", "b"], latestId: "b", read: false, flagged: true };

function handlers(overrides: Partial<MailSwipeHandlers> = {}): MailSwipeHandlers {
  return {
    onToggleRead: jest.fn(),
    onTrash: jest.fn(),
    onArchive: jest.fn(),
    onToggleStar: jest.fn(),
    onMove: jest.fn(),
    ...overrides,
  };
}

function names(right: MailSwipeAction, left: MailSwipeAction, available = handlers()) {
  return resolveMailSwipeAccessibilityActions(right, left, row, available).map(
    (spec) => spec.name,
  );
}

describe("mail swipe actions", () => {
  it("lists the configured swipes first and keeps read and trash", () => {
    expect(names("read", "trash")).toEqual(["read", "trash"]);
    expect(names("star", "archive")).toEqual(["star", "archive", "read", "trash"]);
    expect(names("none", "none")).toEqual(["read", "trash"]);
    expect(names("move", "move")).toEqual(["move", "read", "trash"]);
  });

  it("drops actions without a target on this row", () => {
    const inTrash = handlers({ onTrash: undefined, onArchive: undefined });
    expect(names("archive", "trash", inTrash)).toEqual(["read"]);
    expect(resolveMailSwipeSpec("archive", row, inTrash)).toBeUndefined();
    expect(resolveMailSwipeSpec("none", row, handlers())).toBeUndefined();
  });

  it("runs each action on the row's messages", () => {
    const available = handlers();
    resolveMailSwipeSpec("read", row, available)?.run();
    resolveMailSwipeSpec("star", row, available)?.run();
    resolveMailSwipeSpec("move", row, available)?.run();
    expect(available.onToggleRead).toHaveBeenCalledWith(["a", "b"], false);
    expect(available.onToggleStar).toHaveBeenCalledWith("b", true);
    expect(available.onMove).toHaveBeenCalledWith(["a", "b"]);
    expect(resolveMailSwipeSpec("trash", row, available)).toMatchObject({
      destructive: true,
      dismisses: true,
    });
    expect(resolveMailSwipeSpec("star", row, available)).toMatchObject({
      label: "Unstar",
      dismisses: false,
    });
  });
});

describe("MailSwipeRow", () => {
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockRowProps.current = null;
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it("exposes and dispatches the accessibility actions", async () => {
    const available = handlers();
    const actions = resolveMailSwipeAccessibilityActions("archive", "none", row, available);
    await act(async () => {
      root.render(
        <MailSwipeRow
          enabled
          right={resolveMailSwipeSpec("archive", row, available)}
          accessibilityActions={actions}
        >
          <span />
        </MailSwipeRow>,
      );
    });
    expect(mockRowProps.current?.accessibilityActions).toEqual([
      { name: "archive", label: "Archive" },
      { name: "read", label: "Mark as read" },
      { name: "trash", label: "Move to trash" },
    ]);
    await act(async () => {
      mockRowProps.current?.onAccessibilityAction?.({ nativeEvent: { actionName: "archive" } });
    });
    expect(available.onArchive).toHaveBeenCalledWith(["a", "b"]);
    expect(available.onTrash).not.toHaveBeenCalled();
  });
});
