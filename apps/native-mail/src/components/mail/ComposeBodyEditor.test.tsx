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
let mockPaintDocument = true;
let mockSetPaintDocument: ((paint: boolean) => void) | null = null;
const mockInject = jest.fn();

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  TextInput: () => null,
  ActivityIndicator: () => <span role="progressbar" />,
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  ScrollView: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  View: ({
    children,
    accessibilityLabel,
    accessibilityElementsHidden,
    testID,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    accessibilityElementsHidden?: boolean;
    testID?: string;
  }) => (
    <div
      aria-label={accessibilityLabel}
      aria-hidden={accessibilityElementsHidden}
      data-testid={testID}
    >
      {children}
    </div>
  ),
}));

jest.mock("react-native-webview", () => {
  const { useEffect, useState } = jest.requireActual<typeof React>("react");
  return {
    WebView: (props: WebViewProps) => {
      const [paintDocument, setPaintDocument] = useState(mockPaintDocument);
      mockSetPaintDocument = setPaintDocument;
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
      return (
        <div
          data-testid="mock-webview"
          dangerouslySetInnerHTML={{
            __html: paintDocument ? body.innerHTML : "",
          }}
        />
      );
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
  mockPaintDocument = true;
  mockSetPaintDocument = null;
  mockInject.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

function render(
  value: string,
  placeholder = "Message",
  onChangeText = jest.fn(),
) {
  act(() =>
    root.render(
      <ComposeBodyEditor
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
      />,
    ),
  );
}

function editorReady() {
  act(() => {
    mockPaintDocument = true;
    mockSetPaintDocument?.(true);
    mockWebView?.onMessage({
      nativeEvent: { data: JSON.stringify({ type: "ready" }) },
    });
  });
}

it("shows the seeded body while the WebView is loading without exposing an editable field", () => {
  mockPaintDocument = false;
  const onChangeText = jest.fn();
  render("Saved encrypted draft body", "Message", onChangeText);

  expect(container.textContent).toContain("Saved encrypted draft body");
  expect(container.textContent).toContain("Preparing editor…");
  expect(
    container.querySelector('[data-testid="compose-body-preparing"]'),
  ).not.toBeNull();
  const webView = container.querySelector('[data-testid="mock-webview"]');
  expect(webView).not.toBeNull();
  expect(webView?.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(container.querySelector('[role="textbox"]')).toBeNull();
  expect(onChangeText).not.toHaveBeenCalled();

  editorReady();

  expect(
    container.querySelector('[data-testid="compose-body-preparing"]'),
  ).toBeNull();
  expect(webView?.closest('[aria-hidden="true"]')).toBeNull();
  expect(container.querySelector('[role="textbox"]')?.textContent).toBe(
    "Saved encrypted draft body",
  );
  expect(mockPages).toHaveLength(1);
  expect(onChangeText).not.toHaveBeenCalled();
});

it("keeps a late-ready editor synchronized with the latest preview value", () => {
  mockPaintDocument = false;
  render("First body");
  render("Latest body");

  expect(container.textContent).toContain("Latest body");
  expect(container.textContent).not.toContain("First body");
  editorReady();
  expect(mockInject.mock.calls.at(-1)?.[0]).toContain("Latest body");
  expect(mockPages).toHaveLength(1);
});

it("labels only the editable body so accessibility actions focus the text field", () => {
  render("");
  editorReady();
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
