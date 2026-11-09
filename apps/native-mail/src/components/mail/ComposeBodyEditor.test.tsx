/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeBodyEditor } from "./ComposeBodyEditor";

type WebViewProps = {
  source: { html: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  ref?: (
    instance: { injectJavaScript: (script: string) => void } | null,
  ) => void;
};

const mockPages: string[] = [];
let mockWebView: WebViewProps | null = null;
const mockInject = jest.fn();

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  TextInput: () => null,
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
}));

jest.mock("react-native-webview", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    WebView: (props: WebViewProps) => {
      mockWebView = props;
      if (mockPages.at(-1) !== props.source.html)
        mockPages.push(props.source.html);
      useEffect(() => {
        props.ref?.({ injectJavaScript: mockInject });
      }, [props]);
      const body = new globalThis.DOMParser().parseFromString(
        props.source.html,
        "text/html",
      ).body;
      return <div dangerouslySetInnerHTML={{ __html: body.innerHTML }} />;
    },
  };
});

jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

const mockTheme = jest.requireActual<typeof import("@workspace/design-tokens")>(
  "@workspace/design-tokens",
).nativeLightTheme;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mockPages.length = 0;
  mockWebView = null;
  mockInject.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

function render(value: string, placeholder = "Message") {
  act(() =>
    root.render(
      <ComposeBodyEditor
        value={value}
        onChangeText={jest.fn()}
        placeholder={placeholder}
      />,
    ),
  );
}

function editorReady() {
  act(() =>
    mockWebView?.onMessage({
      nativeEvent: { data: JSON.stringify({ type: "ready" }) },
    }),
  );
}

it("labels only the editable body so accessibility actions focus the text field", () => {
  render("");
  const targets = container.querySelectorAll('[aria-label="Message body"]');
  expect(targets).toHaveLength(1);
  expect(targets[0]?.getAttribute("role")).toBe("textbox");
  expect(targets[0]?.getAttribute("contenteditable")).toBe("true");
});

it("keeps the editor page while the text changes and pushes the text into it instead", () => {
  render("Hello");
  editorReady();
  render("Hello there");

  expect(mockPages).toHaveLength(1);
  expect(mockInject).toHaveBeenCalledWith(
    expect.stringContaining("window.setHtml("),
  );
  expect(mockInject.mock.calls.at(-1)?.[0]).toContain("Hello there");
});

it("rebuilds the page with the current text when its chrome changes", () => {
  render("Hello");
  render("Hello there", "Write a reply");

  expect(mockPages).toHaveLength(2);
  expect(mockPages[1]).toContain("Write a reply");
  expect(mockPages[1]).toContain("Hello there");
});
