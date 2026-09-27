/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HtmlEmailView } from "./HtmlEmailView";

let mockWebViewHtml: string | null = null;

jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Platform: { OS: "ios" },
  StyleSheet: {
    create: (styles: object) => styles,
    absoluteFill: {},
  },
  Text: ({ children }: { children?: ReactNode }) => children,
  View: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock("react-native-webview", () => ({
  WebView: ({ source }: { source: { html: string } }) => {
    mockWebViewHtml = source.html;
    return null;
  },
}));

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));

const REMOTE_IMAGE_URL = "https://cdn.example.com/banner.png";
const EMAIL_HTML = `<p>Hello</p><img src="${REMOTE_IMAGE_URL}" width="600" height="200" alt="Banner">`;

describe("HtmlEmailView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockWebViewHtml = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("blocks remote images when the caller does not opt in", () => {
    act(() => root.render(<HtmlEmailView html={EMAIL_HTML} isDark={false} />));

    expect(mockWebViewHtml).toContain("Hello");
    expect(mockWebViewHtml).not.toContain(REMOTE_IMAGE_URL);
    expect(mockWebViewHtml).not.toMatch(/img-src[^;"]*https:/);
  });

  it("loads remote images only when explicitly allowed", () => {
    act(() =>
      root.render(
        <HtmlEmailView html={EMAIL_HTML} isDark={false} blockRemoteImages={false} />,
      ),
    );

    expect(mockWebViewHtml).toContain(REMOTE_IMAGE_URL);
    expect(mockWebViewHtml).toMatch(/img-src[^;"]*https:/);
  });
});
