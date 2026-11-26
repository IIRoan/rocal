import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  afterPaint,
  htmlToPlainText,
  insertMailTemplateText,
  plainTextToComposeHtml,
  type TextSelection,
} from "@workspace/calendar-core";
import {
  mailEditorCommandScript,
  parseMailEditorEvent,
  type MailEditorCommand,
  type MailEditorFormat,
  type MailEditorFormatState,
} from "@workspace/mail-editor/protocol";
import { MAIL_EDITOR_WEBVIEW_SCRIPT } from "@workspace/mail-editor/webview-script";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

type WebViewModule = typeof import("react-native-webview");
type WebViewComponent = WebViewModule["WebView"];
type WebViewMessageEvent =
  import("react-native-webview/lib/WebViewTypes").WebViewMessageEvent;
type ShouldStartLoadRequest =
  import("react-native-webview/lib/WebViewTypes").ShouldStartLoadRequest;

let WebView: WebViewComponent | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebView = (require("react-native-webview") as WebViewModule).WebView;
} catch {
  WebView = null;
}

/** Whether this binary can run the rich editor; without the WebView module compose writes plain text. */
export const RICH_COMPOSE_AVAILABLE = WebView !== null;

/** A flush the page never answers (it reloaded or hung) falls back to the last HTML it posted. */
const FLUSH_TIMEOUT_MS = 1500;

export type ComposeSignatureCommand = Omit<
  Extract<MailEditorCommand, { type: "applySignature" }>,
  "type"
>;

export type ComposeBodyEditorHandle = {
  format: (format: MailEditorFormat) => void;
  setLink: (href: string | null) => void;
  /** Inserts a template at the caret (the start when the body was never focused), replacing a selection. */
  insertTemplate: (text: string) => void;
  insertImage: (src: string, alt: string) => void;
  applySignature: (input: ComposeSignatureCommand) => void;
  /** Puts loaded quoted images in place (and drops failed ones) without replacing the page's content. */
  updateImages: (sources: ReadonlyMap<string, string>, drop: ReadonlySet<string>) => void;
  /** The editor's current HTML, including keystrokes it has not posted yet; null while composing plain text. */
  flush: () => Promise<string | null>;
};

type ComposeBodyEditorProps = {
  html: string;
  text: string;
  /** Plain-text compose edits `text` in a native field and sends no HTML. */
  plainText: boolean;
  bodySourceVersion: number;
  onChangeHtml: (html: string) => void;
  onChangeText: (text: string) => void;
  onFormatState?: (state: MailEditorFormatState) => void;
  /** The page's own serialization of the body it was just given. */
  onBaseline?: (html: string) => void;
  placeholder: string;
  inputAccessoryViewID?: string;
  onFocusChange?: (focused: boolean) => void;
};

/** Page config is JSON in a script element, so a `<` could close it early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildEditorDocument(input: {
  html: string;
  placeholder: string;
  theme: ThemeTokens;
  skin: MailSkin;
}): string {
  const { html, placeholder, theme, skin } = input;
  const { colors, spacing, borderRadius } = theme;
  const csp =
    "img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    :root { --accent: ${colors.primaryBase}; --border: ${skin.borderPrimary}; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: ${colors.card};
      color: ${colors.foreground};
      font-size: ${skin.body.fontSize}px;
      line-height: ${skin.body.lineHeight}px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-text-size-adjust: 100%;
    }
    .tiptap {
      min-height: 100dvh;
      box-sizing: border-box;
      padding: ${spacing["3"]}px ${spacing["4"]}px;
      outline: none;
      caret-color: ${colors.primaryBase};
      overflow-wrap: break-word;
    }
    .tiptap p { margin: 0.25em 0; }
    .tiptap h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
    .tiptap h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0; }
    .tiptap ul, .tiptap ol { padding-left: 1.5em; margin: 0.25em 0; }
    .tiptap li { margin: 0.125em 0; }
    .tiptap blockquote {
      margin: 0.5em 0;
      padding-left: ${spacing["3"]}px;
      border-left: 2px solid ${skin.borderPrimary};
      color: ${skin.textSecondary};
    }
    .tiptap pre, .tiptap code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }
    .tiptap pre { white-space: pre-wrap; padding: ${spacing["2"]}px; border-radius: ${borderRadius.sm}px; border: 1px solid ${skin.borderPrimary}; }
    .tiptap a { color: ${colors.primaryBase}; text-decoration: underline; }
    .tiptap img { max-width: 100%; height: auto; }
    .tiptap table { border-collapse: collapse; width: 100%; }
    .tiptap td, .tiptap th { border: 1px solid ${skin.borderPrimary}; padding: 4px 6px; vertical-align: top; }
    .tiptap table p { margin: 0; }
    .tiptap hr { border: none; border-top: 1px solid ${skin.borderPrimary}; }
    .tiptap p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      height: 0;
      color: ${skin.textTertiary};
      pointer-events: none;
    }
    .quote-toggle, .quote-remove {
      display: inline-flex;
      align-items: center;
      gap: ${spacing["2"]}px;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: none;
      color: ${skin.textSecondary};
      font: inherit;
      font-size: 14px;
      -webkit-tap-highlight-color: transparent;
    }
    .quote-toggle { min-width: 0; }
    .quote-toggle svg { flex-shrink: 0; color: ${skin.textTertiary}; }
    .quote-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .quote-remove { margin-left: auto; padding-left: ${spacing["3"]}px; }
    .quote-toggle:active, .quote-remove:active { opacity: 0.6; }
  </style>
</head>
<body>
  <div id="editor"></div>
  <script>window.__solaceMailEditorConfig=${scriptJson({ html, placeholder })};</script>
  <script>${MAIL_EDITOR_WEBVIEW_SCRIPT}</script>
</body>
</html>`;
}

export const ComposeBodyEditor = forwardRef<
  ComposeBodyEditorHandle,
  ComposeBodyEditorProps
>(function ComposeBodyEditor(
  {
    html,
    text,
    plainText,
    bodySourceVersion,
    onChangeHtml,
    onChangeText,
    onFormatState,
    onBaseline,
    placeholder,
    inputAccessoryViewID,
    onFocusChange,
  },
  ref,
) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const rich = WebView !== null && !plainText;
  const injectJavaScriptRef = useRef<((script: string) => void) | null>(null);
  const readyRef = useRef(false);
  const queuedRef = useRef<MailEditorCommand[]>([]);
  const lastHtmlRef = useRef(html);
  const appliedBodySourceVersion = useRef(bodySourceVersion);
  const flushIdRef = useRef(0);
  const flushesRef = useRef(new Map<number, (html: string) => void>());
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [editorReady, setEditorReady] = useState(false);
  const reveal = useEditorReveal(editorReady && rich);
  const buildDocument = () => buildEditorDocument({ html, placeholder, theme, skin });
  // Typing updates the page in place, so the document is rebuilt (and the editor reloads) only when its chrome changes.
  const [editorPage, setEditorPage] = useState(() => ({
    placeholder,
    theme,
    skin,
    document: buildDocument(),
  }));
  if (
    editorPage.placeholder !== placeholder ||
    editorPage.theme !== theme ||
    editorPage.skin !== skin
  ) {
    setEditorPage({ placeholder, theme, skin, document: buildDocument() });
    setEditorReady(false);
  }

  const run = (command: MailEditorCommand) => {
    if (!readyRef.current) {
      queuedRef.current.push(command);
      return;
    }
    injectJavaScriptRef.current?.(mailEditorCommandScript(command));
  };

  const applyText = (
    fn: (current: string, currentSelection: TextSelection) => { text: string; selection: TextSelection },
  ) => {
    const next = fn(text, selection);
    onChangeText(next.text);
    setSelection(next.selection);
  };

  useImperativeHandle(ref, () => ({
    format: (format) => run({ type: "format", format }),
    setLink: (href) => run({ type: "setLink", href }),
    insertTemplate: (template) => {
      if (rich) {
        run({ type: "insertHtml", html: plainTextToComposeHtml(template), afterSelection: false });
        return;
      }
      applyText((current, currentSelection) => insertMailTemplateText(current, currentSelection, template));
    },
    insertImage: (src, alt) => run({ type: "insertImage", src, alt }),
    applySignature: (input) => run({ type: "applySignature", ...input }),
    updateImages: (sources, drop) =>
      run({ type: "updateImages", sources: Object.fromEntries(sources), drop: Array.from(drop) }),
    flush: () => {
      if (!rich) return Promise.resolve(null);
      // Before the page is ready it holds nothing newer than the body it is being given.
      if (!readyRef.current) return Promise.resolve(html);
      const id = (flushIdRef.current += 1);
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          flushesRef.current.delete(id);
          resolve(lastHtmlRef.current);
        }, FLUSH_TIMEOUT_MS);
        flushesRef.current.set(id, (flushed) => {
          clearTimeout(timer);
          resolve(flushed);
        });
        run({ type: "flush", id });
      });
    },
  }));

  // A rebuilt page starts unready, so commands wait for its ready message again.
  useEffect(() => {
    readyRef.current = false;
  }, [editorPage.document]);

  useEffect(() => {
    // A React render can acknowledge older keystrokes after the page has already posted newer ones.
    if (!rich || !editorReady || bodySourceVersion === appliedBodySourceVersion.current) return;
    appliedBodySourceVersion.current = bodySourceVersion;
    if (html === lastHtmlRef.current) return;
    lastHtmlRef.current = html;
    injectJavaScriptRef.current?.(mailEditorCommandScript({ type: "setContent", html }));
  }, [bodySourceVersion, editorReady, html, rich]);

  const acceptHtml = (next: string) => {
    if (next === lastHtmlRef.current) return;
    lastHtmlRef.current = next;
    onChangeHtml(next);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseMailEditorEvent(event.nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case "ready": {
        readyRef.current = true;
        const queued = queuedRef.current.splice(0);
        for (const command of queued) injectJavaScriptRef.current?.(mailEditorCommandScript(command));
        setEditorReady(true);
        return;
      }
      case "baseline":
        onBaseline?.(message.html);
        return;
      case "change":
        acceptHtml(message.html);
        return;
      case "flushed": {
        acceptHtml(message.html);
        const resolve = flushesRef.current.get(message.id);
        flushesRef.current.delete(message.id);
        resolve?.(message.html);
        return;
      }
      case "state":
        onFormatState?.(message.state);
        return;
      case "focus":
        onFocusChange?.(true);
        return;
      case "blur":
        onFocusChange?.(false);
        return;
    }
  };

  // The quote renders in a srcdoc frame; nothing else may load in the editor page.
  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    const url = request.url;
    return url === "about:blank" || url === "about:srcdoc" || url.startsWith("data:");
  };

  if (!rich || !WebView) {
    return (
      <TextInput
        style={styles.fallbackInput}
        value={text}
        onChangeText={onChangeText}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        placeholder={placeholder}
        placeholderTextColor={skin.textTertiary}
        selectionColor={theme.colors.primaryBase}
        cursorColor={theme.colors.primaryBase}
        multiline
        textAlignVertical="top"
        autoFocus={false}
        inputAccessoryViewID={inputAccessoryViewID}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        accessibilityLabel="Message body"
      />
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.webView, reveal.editorStyle]}
        pointerEvents={editorReady ? "auto" : "none"}
        accessibilityElementsHidden={!editorReady}
        importantForAccessibility={editorReady ? "auto" : "no-hide-descendants"}
      >
        <WebView
          ref={(instance) => {
            injectJavaScriptRef.current =
              instance?.injectJavaScript?.bind(instance) ?? null;
          }}
          originWhitelist={["about:blank", "about:srcdoc", "data:"]}
          source={{ html: editorPage.document }}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          automaticallyAdjustContentInsets={false}
          nestedScrollEnabled
          style={styles.webView}
        />
      </Animated.View>
      {reveal.previewShown ? (
        <Animated.View
          style={[styles.preparing, reveal.previewStyle]}
          pointerEvents="none"
          accessibilityElementsHidden={editorReady}
          importantForAccessibility={editorReady ? "no-hide-descendants" : "auto"}
          testID={editorReady ? undefined : "compose-body-preparing"}
        >
          <ComposeBodyPreview html={html} placeholder={placeholder} styles={styles} />
          <View style={styles.preparingNotice}>
            <ActivityIndicator size="small" color={skin.textTertiary} />
            <Text style={styles.preparingText}>Preparing editor…</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
});

const REVEAL_MS = 180;

/** The ready editor fades in over its text preview after it has painted; the preview leaves once it is covered. */
function useEditorReveal(ready: boolean) {
  const reveal = useSharedValue(0);
  const [revealed, setRevealed] = useState(false);
  if (!ready && revealed) setRevealed(false);
  useEffect(() => {
    if (!ready) {
      reveal.set(0);
      return;
    }
    return afterPaint(() => {
      reveal.set(
        withTiming(1, { duration: REVEAL_MS }, (finished) => {
          if (finished) scheduleOnRN(setRevealed, true);
        }),
      );
    });
  }, [ready, reveal]);
  return {
    previewShown: !revealed,
    editorStyle: useAnimatedStyle(() => ({ opacity: reveal.get() })),
    previewStyle: useAnimatedStyle(() => ({ opacity: 1 - reveal.get() })),
  };
}

function ComposeBodyPreview({
  html,
  placeholder,
  styles,
}: {
  html: string;
  placeholder: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const preview = htmlToPlainText(html);
  return (
    <ScrollView style={styles.webView}>
      <Text style={[styles.previewText, !preview ? styles.preparingText : null]}>
        {preview || placeholder}
      </Text>
    </ScrollView>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const bodyText = {
    paddingHorizontal: theme.spacing["4"],
    paddingTop: theme.spacing["3"],
    ...skin.body,
  };
  const view = {
    container: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.colors.card,
    },
    webView: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.colors.card,
    },
    preparing: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: theme.colors.card,
    },
    preparingNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    fallbackInput: {
      flex: 1,
      ...bodyText,
    },
    previewText: bodyText,
    preparingText: {
      ...skin.body,
      color: skin.textTertiary,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
