/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeBodyEditor, type ComposeBodyEditorHandle } from "./ComposeBodyEditor";

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
  bodySourceVersion = 0,
) {
  act(() =>
    root.render(
      <ComposeBodyEditor
        value={value}
        bodySourceVersion={bodySourceVersion}
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
  render("Latest body", "Message", undefined, 1);

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
  render("Hello there", "Message", undefined, 1);

  expect(mockPages).toHaveLength(1);
  expect(mockInject).toHaveBeenCalledWith(
    expect.stringContaining("window.setHtml("),
  );
  expect(mockInject.mock.calls.at(-1)?.[0]).toContain("Hello there");
});

it("does not write an older React value back into the WebView after newer typing", () => {
  const onChangeText = jest.fn();
  render("", "Message", onChangeText);
  editorReady();

  act(() => {
    for (const html of ["<p>Maestro</p>", "<p>Maestro body</p>"]) {
      mockWebView?.onMessage({
        nativeEvent: { data: JSON.stringify({ type: "change", html }) },
      });
    }
  });
  render("Maestro", "Message", onChangeText);

  expect(onChangeText).toHaveBeenLastCalledWith("Maestro body");
  expect(mockInject).not.toHaveBeenCalled();
});

it("rebuilds the page with the current text when its chrome changes", () => {
  render("Hello");
  render("Hello there", "Write a reply");

  expect(mockPages).toHaveLength(2);
  expect(mockPages[1]).toContain("Write a reply");
  expect(mockPages[1]).toContain("Hello there");
});

it("opens a reply with an editable blank line above the quote", () => {
  const onChangeText = jest.fn();
  render("\n\nOn Nov 16, Maestro wrote:\n> Hello", "Message", onChangeText);
  editorReady();

  const firstBlock = container.querySelector('[role="textbox"]')?.firstElementChild;
  expect(firstBlock?.outerHTML).toBe("<p><br></p>");

  act(() => {
    mockWebView?.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: "change",
          html: '<p>Thanks</p><p class="quote">On Nov 16, Maestro wrote:<br>&gt; Hello</p>',
        }),
      },
    });
  });
  expect(onChangeText).toHaveBeenLastCalledWith(
    "Thanks\n\nOn Nov 16, Maestro wrote:\n> Hello",
  );
});

it("folds a reply's quoted message to its header until it is tapped", () => {
  render(
    "\n\nOn Nov 16, Maestro wrote:\n> Hello\n> Second line\n\n---------- Forwarded message ----------\nFrom: peer@solace.test",
    "Message",
  );
  type PageWindow = Window & {
    MouseEvent: typeof MouseEvent;
    ReactNativeWebView: { postMessage: (data: string) => void };
  };
  const { JSDOM } = jest.requireActual<{
    JSDOM: new (
      html: string,
      options: { runScripts: "dangerously"; beforeParse: (window: PageWindow) => void },
    ) => { window: PageWindow };
  }>("jsdom");
  const posted: string[] = [];
  const page = new JSDOM(mockPages.at(-1) ?? "", {
    runScripts: "dangerously",
    beforeParse: (window) => {
      window.ReactNativeWebView = { postMessage: (data) => posted.push(data) };
    },
  });
  const [reply, forward] = Array.from(page.window.document.querySelectorAll(".quote"));
  if (!reply || !forward) throw new Error("both quote headers should be marked");

  expect(reply.classList.contains("collapsed")).toBe(true);
  expect(reply.getAttribute("contenteditable")).toBe("false");
  expect(reply.getAttribute("role")).toBe("button");
  expect(reply.getAttribute("aria-expanded")).toBe("false");
  expect(forward.classList.contains("collapsed")).toBe(false);

  reply.dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));

  expect(reply.classList.contains("collapsed")).toBe(false);
  expect(reply.hasAttribute("contenteditable")).toBe(false);
  expect(reply.hasAttribute("role")).toBe(false);
  expect(posted.at(-1)).toBe(JSON.stringify({ type: "focus" }));

  // A body refresh after the reader expanded the quote must not fold it again.
  (page.window as PageWindow & { setHtml: (html: string) => void }).setHtml(
    "<p>Thanks</p><p>On Nov 16, Maestro wrote:<br>&gt; Hello</p>",
  );
  expect(page.window.document.querySelector(".quote")?.classList.contains("collapsed")).toBe(false);
});

it("inserts a template escaped, at the start before any caret and at the remembered caret after", () => {
  const ref = React.createRef<ComposeBodyEditorHandle>();
  act(() =>
    root.render(
      <ComposeBodyEditor
        ref={ref}
        value="Hello world"
        bodySourceVersion={0}
        onChangeText={jest.fn()}
        placeholder="Message"
      />,
    ),
  );
  editorReady();
  act(() => ref.current?.insertText("Hi <team>"));
  const injected = mockInject.mock.calls.at(-1)?.[0];
  expect(injected).toContain("window.insertHtmlAtCaret(");
  expect(injected).toContain("Hi &lt;team&gt;");
  expect(injected).not.toContain("<team>");

  type PageWindow = Window & {
    Event: typeof Event;
    ReactNativeWebView: { postMessage: (data: string) => void };
    insertHtmlAtCaret: (html: string) => void;
  };
  const { JSDOM } = jest.requireActual<{
    JSDOM: new (
      html: string,
      options: { runScripts: "dangerously"; beforeParse: (window: PageWindow) => void },
    ) => { window: PageWindow };
  }>("jsdom");
  const posted: string[] = [];
  const page = new JSDOM(mockPages.at(-1) ?? "", {
    runScripts: "dangerously",
    beforeParse: (window) => {
      window.ReactNativeWebView = { postMessage: (data) => posted.push(data) };
      // jsdom has no editing commands, so insertHTML is emulated at the current selection.
      window.document.execCommand = (_command, _ui, html) => {
        const range = window.getSelection()?.getRangeAt(0);
        range?.insertNode(range.createContextualFragment(String(html)));
        return true;
      };
    },
  });
  const { document: pageDocument } = page.window;
  const editor = pageDocument.getElementById("ed");
  if (!editor) throw new Error("editor missing");

  page.window.insertHtmlAtCaret("<b>A</b>");
  expect(editor.textContent).toBe("AHello world");

  const text = editor.querySelector("p")?.firstChild;
  if (!text) throw new Error("body text missing");
  const selection = page.window.getSelection();
  const caret = pageDocument.createRange();
  caret.setStart(text, 5);
  caret.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(caret);
  pageDocument.dispatchEvent(new page.window.Event("selectionchange"));
  selection?.removeAllRanges();
  pageDocument.dispatchEvent(new page.window.Event("selectionchange"));

  page.window.insertHtmlAtCaret("<i>B</i>");
  expect(editor.textContent).toBe("AHelloB world");
  expect(JSON.parse(posted.at(-1) ?? "{}")).toEqual({ type: "change", html: editor.innerHTML });
});

it("starts writing at the top when an untouched body is tapped below its signature", () => {
  render("\n\n-- \nAlex");
  type PageWindow = Window & {
    Event: typeof Event;
    MouseEvent: typeof MouseEvent;
    ReactNativeWebView: { postMessage: (data: string) => void };
  };
  const { JSDOM } = jest.requireActual<{
    JSDOM: new (
      html: string,
      options: { runScripts: "dangerously"; beforeParse: (window: PageWindow) => void },
    ) => { window: PageWindow };
  }>("jsdom");
  const page = new JSDOM(mockPages.at(-1) ?? "", {
    runScripts: "dangerously",
    beforeParse: (window) => {
      window.ReactNativeWebView = { postMessage: () => undefined };
    },
  });
  const pageDocument = page.window.document;
  const editor = pageDocument.getElementById("ed");
  const signature = editor?.lastElementChild;
  if (!editor || !signature) throw new Error("editor missing");
  const selection = page.window.getSelection();
  const placeCaretAtEnd = () => {
    const end = pageDocument.createRange();
    end.selectNodeContents(signature);
    end.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(end);
  };

  placeCaretAtEnd();
  editor.dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
  expect(selection?.anchorNode).toBe(editor.firstChild);
  expect(selection?.anchorOffset).toBe(0);

  editor.dispatchEvent(new page.window.Event("input", { bubbles: true }));
  placeCaretAtEnd();
  editor.dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
  expect(selection?.anchorNode).toBe(signature);
});
