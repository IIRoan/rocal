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
import {
  applyComposeBold,
  applyComposeItalic,
  applyComposeUnderline,
  composeTextToHtml,
  FORWARDED_MESSAGE_HEADER,
  htmlToComposeText,
  insertMailTemplateText,
  QUOTE_FOLD_LABEL,
  REPLY_QUOTE_HEADER_PATTERN,
  toggleComposeList,
  type TextSelection,
} from "@workspace/calendar-core";
import { sanitizeUntrustedEmailHtml } from "@workspace/calendar-core/sanitize-email-html";
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

export type ComposeBodyEditorHandle = {
  applyBold: () => void;
  applyItalic: () => void;
  applyUnderline: () => void;
  applyList: () => void;
  /** Inserts compose text at the last caret, or at the start when the body was never focused; `afterSelection` keeps selected text. */
  insertText: (text: string, options?: { afterSelection?: boolean }) => void;
};

type ComposeBodyEditorProps = {
  value: string;
  bodySourceVersion: number;
  onChangeText: (text: string) => void;
  placeholder: string;
  inputAccessoryViewID?: string;
  onFocusChange?: (focused: boolean) => void;
};

type EditorMessage =
  | { type: "change"; html: string }
  | { type: "ready" }
  | { type: "focus" }
  | { type: "blur" };

function parseEditorMessage(raw: string): EditorMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const message = parsed as { type?: unknown; html?: unknown };
    if (message.type === "change") {
      return typeof message.html === "string"
        ? { type: "change", html: message.html }
        : null;
    }
    if (
      message.type === "ready" ||
      message.type === "focus" ||
      message.type === "blur"
    ) {
      return { type: message.type };
    }
    return null;
  } catch {
    return null;
  }
}

function buildEditorDocument(input: {
  html: string;
  placeholder: string;
  theme: ThemeTokens;
  skin: MailSkin;
}): string {
  const { html, placeholder, theme, skin } = input;
  const fontSize = skin.body.fontSize;
  const lineHeight = skin.body.lineHeight;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: ${theme.colors.card};
      color: ${theme.colors.foreground};
      font-size: ${fontSize}px;
      line-height: ${lineHeight}px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #ed {
      min-height: 100%;
      padding: ${theme.spacing["3"]}px ${theme.spacing["4"]}px;
      outline: none;
      caret-color: ${theme.colors.primaryBase};
      -webkit-user-select: text;
      user-select: text;
    }
    #ed:empty:before {
      content: attr(data-placeholder);
      color: ${skin.textTertiary};
    }
    #ed .quote {
      margin-top: ${theme.spacing["2"]}px;
      padding-left: ${theme.spacing["3"]}px;
      border-left: 2px solid ${skin.borderPrimary};
      color: ${skin.textSecondary};
    }
    #ed .quote.collapsed {
      position: relative;
      max-height: ${lineHeight}px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding-right: ${theme.spacing["10"]}px;
      cursor: pointer;
    }
    #ed .quote.collapsed::after {
      content: "\\2022\\2022\\2022";
      position: absolute;
      top: 0;
      right: 0;
      padding: 0 ${theme.spacing["2"]}px;
      border-radius: ${theme.borderRadius.sm}px;
      background: ${skin.borderPrimary};
      color: ${skin.textSecondary};
    }
    strong, b { font-weight: 700; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    ul { margin: 0; padding-left: 1.25em; }
  </style>
</head>
<body>
  <div id="ed" role="textbox" aria-label="Message body" aria-multiline="true" contenteditable="true" data-placeholder="${escapeHtmlAttribute(placeholder)}">${sanitizeUntrustedEmailHtml(html)}</div>
  <script>
    (function() {
      var ed = document.getElementById('ed');
      var skip = false;
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      // Marks and attributes only: they are dropped when the HTML is converted back to compose text, so the sent body keeps the quote.
      var replyQuoteHeader = new RegExp(${JSON.stringify(REPLY_QUOTE_HEADER_PATTERN)});
      var forwardedHeader = ${JSON.stringify(FORWARDED_MESSAGE_HEADER)};
      var quoteExpanded = false;
      function collapseReplyQuote(block) {
        block.classList.add('collapsed');
        block.setAttribute('contenteditable', 'false');
        block.setAttribute('role', 'button');
        block.setAttribute('aria-expanded', 'false');
        block.setAttribute('aria-label', ${JSON.stringify(QUOTE_FOLD_LABEL)});
      }
      function expandReplyQuote(block) {
        quoteExpanded = true;
        block.classList.remove('collapsed');
        ['contenteditable', 'role', 'aria-expanded', 'aria-label'].forEach(function(name) {
          block.removeAttribute(name);
        });
      }
      function markQuotes() {
        var blocks = ed.querySelectorAll('p');
        for (var i = 0; i < blocks.length; i++) {
          var text = blocks[i].textContent || '';
          if (replyQuoteHeader.test(text.replace(/^\\s+/, ''))) {
            blocks[i].classList.add('quote');
            // A long quoted chain under the reply crowds the editor on a phone, so it starts folded to its header.
            if (!quoteExpanded) collapseReplyQuote(blocks[i]);
          } else if (text.indexOf(forwardedHeader) === 0) {
            blocks[i].classList.add('quote');
          }
        }
      }
      window.setHtml = function(next) {
        skip = true;
        ed.innerHTML = next || '';
        markQuotes();
        skip = false;
      };
      markQuotes();
      window.applyFormat = function(command) {
        ed.focus();
        document.execCommand(command, false, null);
        post({ type: 'change', html: ed.innerHTML });
      };
      // Opening the template picker blurs the editor, so the caret is remembered for the insert.
      var savedRange = null;
      document.addEventListener('selectionchange', function() {
        var selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && ed.contains(selection.anchorNode)) {
          savedRange = selection.getRangeAt(0).cloneRange();
        }
      });
      window.insertHtmlAtCaret = function(html, afterSelection) {
        ed.focus();
        var selection = window.getSelection();
        var range = savedRange && ed.contains(savedRange.startContainer) ? savedRange : document.createRange();
        if (range !== savedRange) {
          range.setStart(ed, 0);
          range.collapse(true);
        } else if (afterSelection) {
          range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertHTML', false, html);
        post({ type: 'change', html: ed.innerHTML });
      };
      var typed = false;
      function caretToStart() {
        var range = document.createRange();
        range.setStart(ed.firstChild || ed, 0);
        range.collapse(true);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      ed.addEventListener('input', function() {
        if (skip) return;
        typed = true;
        var html = ed.innerHTML;
        if (html === '<br>' || html === '<div><br></div>' || html === '<p><br></p>') {
          ed.innerHTML = '';
          html = '';
        }
        post({ type: 'change', html: html });
      });
      ed.addEventListener('focus', function() {
        post({ type: 'focus' });
      });
      ed.addEventListener('click', function(event) {
        var quote = event.target && event.target.closest ? event.target.closest('.quote.collapsed') : null;
        if (quote) expandReplyQuote(quote);
        // A tap below the text of an untouched body starts writing at the top, above the seeded signature and quote.
        else if (!typed && event.target === ed) caretToStart();
        post({ type: 'focus' });
      });
      ed.addEventListener('blur', function() {
        post({ type: 'blur' });
      });
      post({ type: 'ready' });
    })();
    true;
  </script>
</body>
</html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const ComposeBodyEditor = forwardRef<
  ComposeBodyEditorHandle,
  ComposeBodyEditorProps
>(function ComposeBodyEditor(
  { value, bodySourceVersion, onChangeText, placeholder, inputAccessoryViewID, onFocusChange },
  ref,
) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const injectJavaScriptRef = useRef<((script: string) => void) | null>(null);
  const lastEmittedRef = useRef(value);
  const appliedBodySourceVersion = useRef(bodySourceVersion);
  const [selection, setSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });
  const [editorReady, setEditorReady] = useState(false);
  const buildDocument = () =>
    buildEditorDocument({
      html: composeTextToHtml(value),
      placeholder,
      theme,
      skin,
    });
  // Typing updates the page through setHtml, so the document is rebuilt (and the editor reloads) only when its chrome changes.
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
  const { document } = editorPage;

  const applyFallback = (
    fn: (
      text: string,
      nextSelection: TextSelection,
    ) => { text: string; selection: TextSelection },
  ) => {
    const next = fn(value, selection);
    lastEmittedRef.current = next.text;
    onChangeText(next.text);
    setSelection(next.selection);
  };

  const injectFormat = (command: string) => {
    injectJavaScriptRef.current?.(
      `window.applyFormat(${JSON.stringify(command)}); true;`,
    );
  };

  useImperativeHandle(
    ref,
    () => ({
      applyBold: () => {
        if (WebView && editorReady) {
          injectFormat("bold");
          return;
        }
        applyFallback(applyComposeBold);
      },
      applyItalic: () => {
        if (WebView && editorReady) {
          injectFormat("italic");
          return;
        }
        applyFallback(applyComposeItalic);
      },
      applyUnderline: () => {
        if (WebView && editorReady) {
          injectFormat("underline");
          return;
        }
        applyFallback(applyComposeUnderline);
      },
      applyList: () => {
        if (WebView && editorReady) {
          injectFormat("insertUnorderedList");
          return;
        }
        applyFallback(toggleComposeList);
      },
      insertText: (text: string, options?: { afterSelection?: boolean }) => {
        const afterSelection = options?.afterSelection === true;
        if (WebView && editorReady) {
          injectJavaScriptRef.current?.(
            `window.insertHtmlAtCaret(${JSON.stringify(composeTextToHtml(text))}, ${afterSelection}); true;`,
          );
          return;
        }
        applyFallback((current, currentSelection) =>
          insertMailTemplateText(
            current,
            afterSelection
              ? { start: currentSelection.end, end: currentSelection.end }
              : currentSelection,
            text,
          ),
        );
      },
    }),
  );

  useEffect(() => {
    // A React render can acknowledge older keystrokes after the WebView has already emitted newer ones.
    if (!WebView || !editorReady || bodySourceVersion === appliedBodySourceVersion.current) {
      return;
    }
    appliedBodySourceVersion.current = bodySourceVersion;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    injectJavaScriptRef.current?.(
      `window.setHtml(${JSON.stringify(composeTextToHtml(value))}); true;`,
    );
  }, [bodySourceVersion, editorReady, value]);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseEditorMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "ready") {
      setEditorReady(true);
      return;
    }
    if (message.type === "focus") {
      onFocusChange?.(true);
      return;
    }
    if (message.type === "blur") {
      onFocusChange?.(false);
      return;
    }
    const sanitizedHtml = sanitizeUntrustedEmailHtml(message.html);
    const next = htmlToComposeText(sanitizedHtml);
    if (next === lastEmittedRef.current) return;
    lastEmittedRef.current = next;
    onChangeText(next);
  };

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    const url = request.url;
    return url === "about:blank" || url.startsWith("data:");
  };

  if (!WebView) {
    return (
      <TextInput
        style={styles.fallbackInput}
        value={value}
        onChangeText={(text) => {
          lastEmittedRef.current = text;
          onChangeText(text);
        }}
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
      <View
        style={styles.webView}
        pointerEvents={editorReady ? "auto" : "none"}
        accessibilityElementsHidden={!editorReady}
        importantForAccessibility={editorReady ? "auto" : "no-hide-descendants"}
      >
        <WebView
          ref={(instance) => {
            injectJavaScriptRef.current =
              instance?.injectJavaScript?.bind(instance) ?? null;
          }}
          originWhitelist={["about:blank", "data:"]}
          source={{ html: document }}
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
      </View>
      {!editorReady ? (
        <View style={styles.preparing} testID="compose-body-preparing">
          <ScrollView style={styles.webView}>
            <Text
              style={[styles.previewText, !value ? styles.preparingText : null]}
            >
              {value || placeholder}
            </Text>
          </ScrollView>
          <View style={styles.preparingNotice}>
            <ActivityIndicator size="small" color={skin.textTertiary} />
            <Text style={styles.preparingText}>Preparing editor…</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

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
