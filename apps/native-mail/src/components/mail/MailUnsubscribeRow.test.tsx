/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert } from "react-native";
import type { JmapEmailMessage } from "../../lib/mail/types";
import { MailUnsubscribeRow } from "./MailUnsubscribeRow";

type PressableProps = { onPress: () => void; disabled: boolean; children: ReactNode };

let mockPressable: PressableProps | null = null;

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Pressable: (props: PressableProps) => {
    mockPressable = props;
    return props.children;
  },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { spacing: { "1": 4 } } }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  useMailSkin: () => ({ meta: {}, textTertiary: "" }),
}));

const message: JmapEmailMessage = {
  id: "opaque-list-mail",
  to: [{ email: "owner@solace.test" }],
  "header:Authentication-Results:asText:all": ["mx.solace.test; dkim=pass header.d=news.example"],
  "header:List-Unsubscribe:asURLs": ["https://news.example/u"],
  "header:List-Unsubscribe-Post:asText": "List-Unsubscribe=One-Click",
};

describe("MailUnsubscribeRow", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onUnsubscribe = jest.fn();

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPressable = null;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  function renderRow(next: JmapEmailMessage, pending = false) {
    act(() =>
      root.render(
        <MailUnsubscribeRow
          message={next}
          identities={[{ id: "identity", email: "owner@solace.test" }]}
          pending={pending}
          onUnsubscribe={onUnsubscribe}
        />,
      ),
    );
  }

  it("confirms the one-click request before running it", () => {
    renderRow(message);
    expect(container.textContent).toBe("Unsubscribe");
    act(() => mockPressable?.onPress());

    const [title, body, buttons] = jest.mocked(Alert.alert).mock.calls[0] ?? [];
    expect(title).toBe("Unsubscribe?");
    expect(body).toBe(
      "Solace asks news.example to remove owner@solace.test from this list. The sender sees your IP address.",
    );
    expect(onUnsubscribe).not.toHaveBeenCalled();
    buttons?.find((button) => button.text === "Unsubscribe")?.onPress?.();
    expect(onUnsubscribe).toHaveBeenCalledWith(message);
  });

  it("shows pending and done states without another action", () => {
    renderRow(message, true);
    expect(container.textContent).toBe("Unsubscribing…");
    renderRow({ ...message, keywords: { $unsubscribed: true } });
    expect(container.textContent).toBe("Unsubscribed");
    expect(mockPressable?.disabled).toBe(true);
  });

  it("hides the line for mail without a passing DKIM signature", () => {
    renderRow({ ...message, "header:Authentication-Results:asText:all": ["mx; dkim=fail"] });
    expect(container.textContent).toBe("");
  });
});
