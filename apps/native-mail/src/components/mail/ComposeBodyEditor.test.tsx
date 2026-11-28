/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mailEditorCommandScript, type MailEditorCommand } from "@workspace/mail-editor/protocol";
import { ComposeBodyEditor, type ComposeBodyEditorHandle } from "./ComposeBodyEditor";

type WebViewProps = {
  source: { html: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  ref?: (instance: { injectJavaScript: (script: string) => void } | null) => void;
};

const mockPages: string[] = [];
let mockWebView: WebViewProps | null = null;
const mockInject = jest.fn();
let mockTextInput: { value: string; onChangeText: (text: string) => void; onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void } | null = null;

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  TextInput: (props: NonNullable<typeof mockTextInput> & { accessibilityLabel?: string }) => {
    mockTextInput = props;
    return <textarea aria-label={props.accessibilityLabel} value={props.value} readOnly />;
  },
  ActivityIndicator: () => <span role="progressbar" />,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  ScrollView: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  View: ({
    children,
    accessibilityElementsHidden,
    testID,
  }: {
    children?: React.ReactNode;
    accessibilityElementsHidden?: boolean;
    testID?: string;
  }) => (
    <div aria-hidden={accessibilityElementsHidden} data-testid={testID}>
      {children}
    </div>
  ),
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: ({
      children,
      accessibilityElementsHidden,
      testID,
    }: {
      children?: React.ReactNode;
      accessibilityElementsHidden?: boolean;
      testID?: string;
    }) => (
      <div aria-hidden={accessibilityElementsHidden} data-testid={testID}>
        {children}
      </div>
    ),
  },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: unknown) => ({ get: () => value, set: () => undefined }),
  withTiming: (value: unknown) => value,
}));
jest.mock("react-native-worklets", () => ({ scheduleOnRN: jest.fn() }));

jest.mock("react-native-webview", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    WebView: (props: WebViewProps) => {
      mockWebView = props;
      if (mockPages.at(-1) !== props.source.html) mockPages.push(props.source.html);
      useEffect(() => {
        props.ref?.({ injectJavaScript: mockInject });
      }, [props]);
      return <div data-testid="mock-webview" />;
    },
  };
});

jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: mockTheme }),
}));

const mockTheme = jest.requireActual<typeof import("@workspace/design-tokens")>(
  "@workspace/design-tokens",
).nativeLightTheme;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mockPages.length = 0;
  mockWebView = null;
  mockTextInput = null;
  mockInject.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

type RenderOptions = {
  html?: string;
  text?: string;
  plainText?: boolean;
  placeholder?: string;
  bodySourceVersion?: number;
  onChangeHtml?: jest.Mock;
  onChangeText?: jest.Mock;
  onFormatState?: jest.Mock;
  onBaseline?: jest.Mock;
  editorRef?: React.RefObject<ComposeBodyEditorHandle | null>;
};

function render(options: RenderOptions = {}) {
  act(() =>
    root.render(
      <ComposeBodyEditor
        ref={options.editorRef}
        html={options.html ?? ""}
        text={options.text ?? ""}
        plainText={options.plainText ?? false}
        bodySourceVersion={options.bodySourceVersion ?? 0}
        onChangeHtml={options.onChangeHtml ?? jest.fn()}
        onChangeText={options.onChangeText ?? jest.fn()}
        onFormatState={options.onFormatState}
        onBaseline={options.onBaseline}
        placeholder={options.placeholder ?? "Message"}
      />,
    ),
  );
}

function post(message: unknown) {
  act(() => {
    mockWebView?.onMessage({ nativeEvent: { data: JSON.stringify(message) } });
  });
}

const injected = (command: MailEditorCommand) => mailEditorCommandScript(command);

it("shows the seeded body as text while the editor page loads, without an editable field", () => {
  const onChangeHtml = jest.fn();
  render({ html: "<p>Saved encrypted draft body</p>", onChangeHtml });

  expect(container.textContent).toContain("Saved encrypted draft body");
  expect(container.textContent).toContain("Preparing editor…");
  const webView = container.querySelector('[data-testid="mock-webview"]');
  expect(webView?.closest('[aria-hidden="true"]')).not.toBeNull();

  post({ type: "ready" });

  expect(container.querySelector('[data-testid="compose-body-preparing"]')).toBeNull();
  expect(webView?.closest('[aria-hidden="true"]')).toBeNull();
  expect(mockPages).toHaveLength(1);
  expect(onChangeHtml).not.toHaveBeenCalled();
});

it("puts the editor bundle and its seeded body in a page that loads nothing remote", () => {
  render({ html: "<p>Hi</p><script>bad()</script>", placeholder: "Write </script> here" });
  const page = mockPages[0] ?? "";
  expect(page).toContain("window.__solaceMailEditorConfig=");
  expect(page).toContain("\\u003cp>Hi\\u003c/p>");
  expect(page).not.toContain("<script>bad()</script>");
  expect(page).not.toContain("Write </script> here");
  expect(page).toContain("img-src data:; connect-src 'none'");
  expect(mockWebView?.onShouldStartLoadWithRequest({ url: "about:srcdoc" })).toBe(true);
  expect(mockWebView?.onShouldStartLoadWithRequest({ url: "https://tracker.example/x" })).toBe(false);
});

it("keeps a late-ready editor synchronized with the latest body", () => {
  render({ html: "<p>First body</p>" });
  render({ html: "<p>Latest body</p>", bodySourceVersion: 1 });
  expect(container.textContent).toContain("Latest body");
  post({ type: "ready" });
  expect(mockInject).toHaveBeenLastCalledWith(injected({ type: "setContent", html: "<p>Latest body</p>" }));
  expect(mockPages).toHaveLength(1);
});

it("keeps the page while typing and pushes only outside changes into it", () => {
  const onChangeHtml = jest.fn();
  render({ html: "<p>Hello</p>", onChangeHtml });
  post({ type: "ready" });
  post({ type: "change", html: "<p>Hello there</p>" });
  expect(onChangeHtml).toHaveBeenLastCalledWith("<p>Hello there</p>");
  render({ html: "<p>Hello there</p>", onChangeHtml });
  expect(mockInject).not.toHaveBeenCalled();

  render({ html: "<p>Signed</p>", bodySourceVersion: 1, onChangeHtml });
  expect(mockInject).toHaveBeenLastCalledWith(injected({ type: "setContent", html: "<p>Signed</p>" }));
  expect(mockPages).toHaveLength(1);
});

it("does not write an older React value back into the page after newer typing", () => {
  const onChangeHtml = jest.fn();
  render({ html: "", onChangeHtml });
  post({ type: "ready" });
  post({ type: "change", html: "<p>Maestro</p>" });
  post({ type: "change", html: "<p>Maestro body</p>" });
  render({ html: "<p>Maestro</p>", onChangeHtml });
  expect(onChangeHtml).toHaveBeenLastCalledWith("<p>Maestro body</p>");
  expect(mockInject).not.toHaveBeenCalled();
});

it("ignores malformed page messages", () => {
  const onChangeHtml = jest.fn();
  const onFormatState = jest.fn();
  render({ onChangeHtml, onFormatState });
  post({ type: "change", html: 1 });
  post({ type: "state", state: { bold: "yes" } });
  post({ type: "focus", extra: true });
  expect(onChangeHtml).not.toHaveBeenCalled();
  expect(onFormatState).not.toHaveBeenCalled();
});

it("rebuilds the page with the current body when its chrome changes", () => {
  render({ html: "<p>Hello</p>" });
  render({ html: "<p>Hello there</p>", placeholder: "Write a reply" });
  expect(mockPages).toHaveLength(2);
  expect(mockPages[1]).toContain("Write a reply");
  expect(mockPages[1]).toContain("Hello there");
});

it("queues commands until the page is ready and reports the formatting under the caret", () => {
  const editorRef = React.createRef<ComposeBodyEditorHandle>();
  const onFormatState = jest.fn();
  render({ editorRef, onFormatState });
  act(() => editorRef.current?.format("bold"));
  act(() => editorRef.current?.insertTemplate("Hi <team>\n\nThanks"));
  expect(mockInject).not.toHaveBeenCalled();

  post({ type: "ready" });
  expect(mockInject.mock.calls.map(([script]) => script)).toEqual([
    injected({ type: "format", format: "bold" }),
    injected({ type: "insertHtml", html: "<p>Hi &lt;team&gt;</p><p>Thanks</p>", afterSelection: false }),
  ]);

  act(() => editorRef.current?.setLink("https://solace.onl"));
  expect(mockInject).toHaveBeenLastCalledWith(injected({ type: "setLink", href: "https://solace.onl" }));
  const state = { bold: true, italic: false, underline: false, strike: false, bulletList: false, orderedList: false, blockquote: false, link: null, hasSelection: false, canUndo: true, canRedo: false };
  post({ type: "state", state });
  expect(onFormatState).toHaveBeenLastCalledWith(state);
});

it("flushes the latest HTML from the page, and falls back to the last posted HTML", async () => {
  jest.useFakeTimers();
  try {
    const editorRef = React.createRef<ComposeBodyEditorHandle>();
    const onChangeHtml = jest.fn();
    render({ editorRef, html: "<p>Draft</p>", onChangeHtml });
    post({ type: "ready" });

    let flushed: Promise<string | null> | undefined;
    act(() => {
      flushed = editorRef.current?.flush();
    });
    expect(mockInject).toHaveBeenLastCalledWith(injected({ type: "flush", id: 1 }));
    post({ type: "flushed", id: 1, html: "<p>Draft, typed just now</p>" });
    await expect(flushed).resolves.toBe("<p>Draft, typed just now</p>");
    expect(onChangeHtml).toHaveBeenLastCalledWith("<p>Draft, typed just now</p>");

    act(() => {
      flushed = editorRef.current?.flush();
    });
    act(() => jest.advanceTimersByTime(1500));
    await expect(flushed).resolves.toBe("<p>Draft, typed just now</p>");
  } finally {
    jest.useRealTimers();
  }
});

it("answers a flush before the page is ready with the body it is being given", async () => {
  const editorRef = React.createRef<ComposeBodyEditorHandle>();
  render({ editorRef, html: "" });
  render({ editorRef, html: "<p>Seeded reply</p>", bodySourceVersion: 1 });
  await expect(editorRef.current?.flush()).resolves.toBe("<p>Seeded reply</p>");
});

it("reports the page's baseline and patches loaded images in without replacing the page", () => {
  const editorRef = React.createRef<ComposeBodyEditorHandle>();
  const onBaseline = jest.fn();
  render({ editorRef, html: "<p>Hi</p>", onBaseline });
  post({ type: "ready" });
  post({ type: "baseline", html: "<p>Hi</p>" });
  expect(onBaseline).toHaveBeenCalledWith("<p>Hi</p>");
  act(() => editorRef.current?.updateImages(new Map([["a@x", "data:image/png;base64,AA=="]]), new Set(["b@x"])));
  expect(mockInject).toHaveBeenLastCalledWith(
    injected({ type: "updateImages", sources: { "a@x": "data:image/png;base64,AA==" }, drop: ["b@x"] }),
  );
});

it("edits plain text in a native field and inserts a template at the caret", async () => {
  const editorRef = React.createRef<ComposeBodyEditorHandle>();
  const onChangeText = jest.fn();
  render({ editorRef, plainText: true, text: "Hello world", onChangeText });
  expect(container.querySelector('textarea[aria-label="Message body"]')).not.toBeNull();
  expect(mockWebView).toBeNull();
  await expect(editorRef.current?.flush()).resolves.toBeNull();

  act(() => mockTextInput?.onSelectionChange({ nativeEvent: { selection: { start: 5, end: 5 } } }));
  act(() => editorRef.current?.insertTemplate(" there"));
  expect(onChangeText).toHaveBeenLastCalledWith("Hello there world");
});

describe("the editor page", () => {
  type PageWindow = Window & {
    ReactNativeWebView: { postMessage: (data: string) => void };
    eval: (script: string) => unknown;
    MouseEvent: typeof MouseEvent;
  };
  const { JSDOM } = jest.requireActual<{
    JSDOM: new (
      html: string,
      options: { runScripts: "dangerously"; pretendToBeVisual: boolean; beforeParse: (window: PageWindow) => void },
    ) => { window: PageWindow };
  }>("jsdom");

  function openPage(html: string) {
    render({ html });
    const posted: Record<string, unknown>[] = [];
    const page = new JSDOM(mockPages.at(-1) ?? "", {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse: (window) => {
        window.ReactNativeWebView = { postMessage: (data) => posted.push(JSON.parse(data) as Record<string, unknown>) };
      },
    });
    const run = (command: MailEditorCommand) => page.window.eval(mailEditorCommandScript(command));
    const flush = () => {
      run({ type: "flush", id: 7 });
      const last = posted.at(-1);
      if (last?.type !== "flushed") throw new Error("flush was not answered");
      return String(last.html);
    };
    return { page, posted, run, flush };
  }

  it("starts the shared editor, applies formatting and answers a flush", () => {
    const { page, posted, run, flush } = openPage("<p>Hello</p>");
    expect(posted.some((message) => message.type === "ready")).toBe(true);
    const textbox = page.window.document.querySelector('[role="textbox"][aria-label="Message body"]');
    expect(textbox?.getAttribute("contenteditable")).toBe("true");

    run({ type: "focus", position: "end" });
    run({ type: "insertHtml", html: "<p>Hi &lt;team&gt;</p>", afterSelection: true });
    run({ type: "format", format: "bulletList" });
    expect(flush()).toContain("<p>Hello</p><ul><li><p>Hi &lt;team&gt;</p></li></ul>");
    expect(posted.some((message) => message.type === "state" && (message.state as { bulletList: boolean }).bulletList)).toBe(true);
  });

  it("keeps typing in order across draft flushes and delayed React acknowledgements", () => {
    const { page, posted, run, flush } = openPage("");
    mockInject.mockImplementation((script: string) => page.window.eval(script));
    post({ type: "ready" });
    let acknowledged = "";

    for (const character of "Maestro body survives encrypted draft storage") {
      run({ type: "insertHtml", html: character, afterSelection: false });
      const current = flush();
      post(posted.at(-1));
      render({ html: acknowledged });
      acknowledged = current;
    }

    expect(flush()).toBe("<p>Maestro body survives encrypted draft storage</p>");
    expect(mockPages).toHaveLength(1);
    expect(mockInject).not.toHaveBeenCalled();
    mockInject.mockReset();
  });

  it("inserts a link at the caret and drops a script link", () => {
    const { run, flush } = openPage("<p>Docs</p>");
    run({ type: "focus", position: "end" });
    run({ type: "setLink", href: "https://solace.onl" });
    expect(flush()).toMatch(/^<p>Docs<a [^>]*href="https:\/\/solace\.onl"[^>]*>https:\/\/solace\.onl<\/a><\/p>$/);
    run({ type: "setContent", html: '<p><a href="javascript:alert(1)">bad</a></p>' });
    expect(flush()).not.toContain("javascript:");
  });

  it("swaps the marked signature in place when the sender changes", () => {
    const { run, flush, posted } = openPage('<p>Hi</p><p data-signature-block="start"></p><p>Alex Doe</p><p data-signature-block="end"></p>');
    run({
      type: "applySignature",
      candidates: [{ textSignature: "Alex Doe" }, { textSignature: "Alex" }],
      next: { textSignature: "Alex" },
      separator: false,
      aboveQuote: false,
      insert: false,
    });
    expect(posted.at(-1)?.type).toBe("change");
    expect(flush()).toBe('<p>Hi</p><p data-signature-block="start"></p><p>Alex</p><p data-signature-block="end"></p>');
  });

  it("shows a quoted message in a sandboxed frame and keeps it in the body", () => {
    const quote = '<div><p>On Monday, Sam wrote:</p></div><div data-quoted-html><p>Original</p></div>';
    const { page, flush } = openPage(`<p></p>${quote}`);
    const frame = page.window.document.querySelector(".quoted-html-island iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
    const toggle = page.window.document.querySelector<HTMLButtonElement>("button.quote-toggle");
    expect(toggle?.textContent).toBe("On Monday, Sam wrote");
    toggle?.click();
    toggle?.click();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(flush()).toBe("<p></p><p>On Monday, Sam wrote:</p><div data-quoted-html><p>Original</p></div>");
  });

  it("drops a reply's quote and its header line when the user removes it", () => {
    const { page, flush } = openPage('<p>Thanks</p><div><p>On Monday, Sam wrote:</p></div><div data-quoted-html><p>Original</p></div>');
    page.window.document.querySelector<HTMLButtonElement>("button.quote-remove")?.click();
    expect(flush()).toBe("<p>Thanks</p>");
  });

  it("puts loaded quoted images in place and drops failed ones without posting an edit", () => {
    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const quote = `<div data-quoted-html><p>Logo<img src="${placeholder}" data-cid="a@x"><img src="${placeholder}" data-cid="b@x"></p></div>`;
    const { posted, run, flush } = openPage(`<p>Reply</p>${quote}`);
    expect(posted.some((message) => message.type === "baseline")).toBe(true);
    run({ type: "updateImages", sources: { "a@x": "data:image/png;base64,AA==" }, drop: ["b@x"] });
    expect(posted.some((message) => message.type === "change")).toBe(false);
    const html = flush();
    expect(html).toContain('src="data:image/png;base64,AA==" data-cid="a@x"');
    expect(html).not.toContain("b@x");
    expect(html.startsWith("<p>Reply</p>")).toBe(true);
  });

  it("starts writing at the top when an untouched body is tapped below its text", () => {
    const { page, run, flush } = openPage('<p></p><p data-signature-block="separator">-- </p><p>Alex</p><p data-signature-block="end"></p>');
    const textbox = page.window.document.querySelector('[role="textbox"]');
    textbox?.dispatchEvent(new page.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    run({ type: "insertHtml", html: "Thanks", afterSelection: false });
    expect(flush().startsWith("<p>Thanks</p>")).toBe(true);
  });
});
