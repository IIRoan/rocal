/** @jest-environment jsdom */

import { runInNewContext } from "node:vm";
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { nativeMailLightTheme } from "@workspace/design-tokens";
import { HtmlEmailView } from "./HtmlEmailView";

type MockWebViewProps = {
  source: { html: string };
  injectedJavaScript: string;
  originWhitelist: string[];
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
};

let mockWebViewHtml: string | null = null;
let mockWebViewProps: MockWebViewProps | null = null;

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
  WebView: (props: MockWebViewProps) => {
    mockWebViewHtml = props.source.html;
    mockWebViewProps = props;
    return null;
  },
}));


const REMOTE_IMAGE_URL = "https://cdn.example.com/banner.png";
const EMAIL_HTML = `<p>Hello</p><img src="${REMOTE_IMAGE_URL}" width="600" height="200" alt="Banner">`;

describe("HtmlEmailView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const onLinkPress = jest.fn();

  beforeEach(() => {
    onLinkPress.mockReset();
    mockWebViewHtml = null;
    mockWebViewProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("blocks remote images when the caller does not opt in", () => {
    act(() =>
      root.render(
        <HtmlEmailView
          html={EMAIL_HTML}
          isDark={false}
          theme={nativeMailLightTheme}
          onLinkPress={onLinkPress}
        />,
      ),
    );

    expect(mockWebViewHtml).toContain("Hello");
    expect(mockWebViewHtml).not.toContain(REMOTE_IMAGE_URL);
    expect(mockWebViewHtml).not.toMatch(/img-src[^;"]*https:/);
  });

  it("loads remote images only when explicitly allowed", () => {
    act(() =>
      root.render(
        <HtmlEmailView
          html={EMAIL_HTML}
          isDark={false}
          theme={nativeMailLightTheme}
          blockRemoteImages={false}
          onLinkPress={onLinkPress}
        />,
      ),
    );

    expect(mockWebViewHtml).toContain(REMOTE_IMAGE_URL);
    expect(mockWebViewHtml).toMatch(/img-src[^;"]*https:/);
  });

  it("fits wide mail after Android lays out the WebView and restores it when it fits", () => {
    act(() => root.render(
      <HtmlEmailView html={EMAIL_HTML} isDark={false} theme={nativeMailLightTheme} onLinkPress={onLinkPress} />,
    ));
    if (!mockWebViewProps) throw new Error("WebView not rendered");
    const document = window.document.implementation.createHTMLDocument();
    Object.defineProperty(document, "readyState", { value: "complete" });
    Object.defineProperty(document.body, "scrollWidth", { value: 600 });
    const viewport = Object.assign(new EventTarget(), { innerWidth: 0 });
    runInNewContext(mockWebViewProps.injectedJavaScript, { window: viewport, document, setTimeout: jest.fn() });
    expect(document.body.style.transform).toBe("");

    viewport.innerWidth = 300;
    viewport.dispatchEvent(new Event("resize"));
    expect(document.body.style.transform).toBe("scale(0.5)");

    viewport.innerWidth = 600;
    viewport.dispatchEvent(new Event("resize"));
    expect(document.body.style.transform).toBe("");
    expect(document.body.style.width).toBe("");
  });

  it("hands tapped links to the host and ignores malformed messages", () => {
    act(() =>
      root.render(
        <HtmlEmailView html={EMAIL_HTML} isDark={false} theme={nativeMailLightTheme} onLinkPress={onLinkPress} />,
      ),
    );
    const props = mockWebViewProps;
    if (!props) throw new Error("WebView not rendered");

    expect(props.injectedJavaScript).toContain("'link:'");
    expect(props.originWhitelist).toEqual(expect.arrayContaining(["mailto:*", "tel:*"]));
    props.onMessage({ nativeEvent: { data: 'link:{"href":"mailto:a@example.org","text":"Write"}' } });
    props.onMessage({ nativeEvent: { data: "link:{not json" } });
    props.onMessage({ nativeEvent: { data: 'link:{"href":"https://x.test","text":"x","extra":1}' } });
    expect(onLinkPress.mock.calls).toEqual([[{ href: "mailto:a@example.org", text: "Write" }]]);

    expect(props.onShouldStartLoadWithRequest({ url: "tel:+31201234567" })).toBe(false);
    expect(props.onShouldStartLoadWithRequest({ url: "data:text/html,x" })).toBe(false);
    expect(props.onShouldStartLoadWithRequest({ url: "about:blank" })).toBe(true);
    expect(onLinkPress).toHaveBeenLastCalledWith({ href: "tel:+31201234567", text: "" });
    expect(onLinkPress).toHaveBeenCalledTimes(2);
  });
});
