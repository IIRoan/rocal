/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MailThreadStack } from "./MailThreadStack";
import type { JmapEmailMessage } from "../../lib/mail/types";

type PressableProps = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Pressable: ({ onPress, accessibilityLabel, children }: PressableProps) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    hairlineWidth: 1,
  },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: { colors: {}, spacing: {}, borderRadius: {} },
  }),
}));
jest.mock("@workspace/native-core/hooks/use-user-time-format", () => ({
  useUserTimeFormat: () => "24h",
}));
jest.mock("@workspace/native-core/hooks/use-user-timezone", () => ({
  useUserTimezone: () => "UTC",
}));
jest.mock("@workspace/native-core/components/BlobatarAvatar", () => ({
  BlobatarAvatar: () => null,
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { hitSize: 44, unreadDotSize: 8 },
  mailColors: () => ({ border: "border" }),
  useMailSkin: () => ({ meta: {} }),
}));

const thread: JmapEmailMessage[] = ["a", "b", "c", "d", "e", "f", "g"].map(
  (id, index) => ({
    id,
    threadId: "t",
    receivedAt: `2026-03-2${index}T10:00:00Z`,
    from: [{ email: `${id}@example.com`, name: id.toUpperCase() }],
    keywords: { $seen: id !== "a" },
  }),
);

describe("native mail thread stack", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens the newest message in place, folds the run before it and wires the rows", () => {
    const onShowAll = jest.fn();
    const onSelectMessage = jest.fn();
    act(() =>
      root.render(
        <MailThreadStack
          messages={thread}
          activeMessageId="g"
          loading={false}
          showAll={false}
          onShowAll={onShowAll}
          onSelectMessage={onSelectMessage}
        >
          <p>open message</p>
        </MailThreadStack>,
      ),
    );

    const labels = Array.from(container.querySelectorAll("button")).map(
      (button) => button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Open message from A, unread",
      "Show 4 more messages",
      "Open message from F",
    ]);
    expect(container.lastElementChild?.textContent).toContain("open message");

    act(() => container.querySelector("button")?.click());
    expect(onSelectMessage).toHaveBeenCalledWith("a");
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Show 4 more messages"]')
        ?.click(),
    );
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
