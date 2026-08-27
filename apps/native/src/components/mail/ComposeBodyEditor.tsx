import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
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
  htmlToComposeText,
  toggleComposeList,
  type TextSelection,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

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
};

type ComposeBodyEditorProps = {
  value: string;
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
    const parsed = JSON.parse(raw) as EditorMessage;
    if (parsed?.type === "change" && typeof parsed.html === "string") {
      return parsed;
    }
    if (
      parsed?.type === "ready" ||
      parsed?.type === "focus" ||
      parsed?.type === "blur"
    ) {
      return parsed;
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
}): string {
  const { html, placeholder, theme } = input;
  const fontSize = theme.typography.fontSize.base.size;
  const lineHeight = theme.typography.fontSize.base.lineHeight;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: ${theme.colors.background};
      color: ${theme.colors.foreground};
      font-size: ${fontSize}px;
      line-height: ${lineHeight}px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #ed {
      min-height: 100%;
      padding: ${theme.spacing["3"]}px ${theme.spacing["4"]}px;
      outline: none;
      -webkit-user-select: text;
      user-select: text;
    }
    #ed:empty:before {
      content: attr(data-placeholder);
      color: ${theme.colors.mutedForeground};
    }
    strong, b { font-weight: 700; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    ul { margin: 0; padding-left: 1.25em; }
  </style>
</head>
<body>
  <div id="ed" contenteditable="true" data-placeholder="${escapeHtmlAttribute(placeholder)}">${html}</div>
  <script>
    (function() {
      var ed = document.getElementById('ed');
      var skip = false;
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      window.setHtml = function(next) {
        skip = true;
        ed.innerHTML = next || '';
        skip = false;
      };
      window.applyFormat = function(command) {
        ed.focus();
        document.execCommand(command, false, null);
        post({ type: 'change', html: ed.innerHTML });
      };
      ed.addEventListener('input', function() {
        if (skip) return;
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
      ed.addEventListener('click', function() {
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
  { value, onChangeText, placeholder, inputAccessoryViewID, onFocusChange },
  ref,
) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const injectJavaScriptRef = useRef<((script: string) => void) | null>(null);
  const lastEmittedRef = useRef(value);
  const [selection, setSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });
  const [editorReady, setEditorReady] = useState(false);

  const document = useMemo(
    () =>
      buildEditorDocument({
        html: composeTextToHtml(value),
        placeholder,
        theme,
      }),
    // Recreate only when chrome changes; typing updates via setHtml.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeholder, theme],
  );

  const isFirstDocument = useRef(true);
  useEffect(() => {
    if (isFirstDocument.current) {
      isFirstDocument.current = false;
      return;
    }
    setEditorReady(false);
  }, [document]);

  const applyFallback = useCallback(
    (
      fn: (
        text: string,
        nextSelection: TextSelection,
      ) => { text: string; selection: TextSelection },
    ) => {
      const next = fn(value, selection);
      lastEmittedRef.current = next.text;
      onChangeText(next.text);
      setSelection(next.selection);
    },
    [onChangeText, selection, value],
  );

  const injectFormat = useCallback((command: string) => {
    injectJavaScriptRef.current?.(
      `window.applyFormat(${JSON.stringify(command)}); true;`,
    );
  }, []);

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
    }),
    [applyFallback, editorReady, injectFormat],
  );

  useEffect(() => {
    if (!WebView || !editorReady || value === lastEmittedRef.current) {
      return;
    }
    lastEmittedRef.current = value;
    injectJavaScriptRef.current?.(
      `window.setHtml(${JSON.stringify(composeTextToHtml(value))}); true;`,
    );
  }, [editorReady, value]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
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
      const next = htmlToComposeText(message.html);
      lastEmittedRef.current = next;
      if (next !== value) {
        onChangeText(next);
      }
    },
    [onChangeText, onFocusChange, value],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const url = request.url;
      return url === "about:blank" || url.startsWith("data:");
    },
    [],
  );

  if (!WebView) {
    return (
      <TextInput
        style={styles.fallbackInput}
        value={value}
        onChangeText={(text) => {
          lastEmittedRef.current = text;
          onChangeText(text);
        }}
        onSelectionChange={(event) =>
          setSelection(event.nativeEvent.selection)
        }
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
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
    <View style={styles.container} accessibilityLabel="Message body">
      <WebView
        ref={(instance) => {
          injectJavaScriptRef.current =
            instance?.injectJavaScript?.bind(instance) ?? null;
        }}
        originWhitelist={["*"]}
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
  );
});

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.colors.background,
    },
    webView: {
      flex: 1,
      minHeight: 0,
      backgroundColor: theme.colors.background,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    fallbackInput: {
      flex: 1,
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
