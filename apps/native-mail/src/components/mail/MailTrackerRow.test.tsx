/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MailTrackerRow } from "./MailTrackerRow";

type PressableProps = { onPress: () => void; accessibilityLabel: string; style: { minHeight?: number }; children: ReactNode };

let mockPressable: PressableProps | null = null;

jest.mock("react-native", () => ({
  Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) => (visible ? children : null),
  Pressable: (props: PressableProps) => {
    mockPressable = props;
    return props.children;
  },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { spacing: { "1": 4 } } }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { hitSize: 44 },
  useMailSkin: () => ({ meta: {}, textTertiary: "" }),
}));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({
  BottomSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BottomSheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BottomSheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => ({
  SheetGroup: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SheetItem: ({ label }: { label: string }) => <li>{label}</li>,
  SheetScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetSection: ({ children, footer }: { children: ReactNode; footer: string }) => (
    <section>
      {children}
      <p>{footer}</p>
    </section>
  ),
}));

describe("MailTrackerRow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockPressable = null;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("names the count and lists the blocked hosts in its drawer", () => {
    act(() => root.render(<MailTrackerRow trackers={{ count: 3, hosts: ["a.example", "b.example"] }} />));
    expect(container.textContent).toBe("Blocked 3 trackers");
    expect(mockPressable?.accessibilityLabel).toBe("Blocked 3 trackers. Show details");
    expect(mockPressable?.style.minHeight).toBeGreaterThanOrEqual(44);

    act(() => mockPressable?.onPress());
    const hosts = [...container.querySelectorAll("li")].map((item) => item.textContent);
    expect(hosts).toEqual(["a.example", "b.example"]);
    expect(container.textContent).toContain("They never load, even after you load images.");
  });

  it("renders nothing without trackers", () => {
    act(() => root.render(<MailTrackerRow trackers={{ count: 0, hosts: [] }} />));
    expect(container.textContent).toBe("");
    expect(mockPressable).toBeNull();
  });
});
