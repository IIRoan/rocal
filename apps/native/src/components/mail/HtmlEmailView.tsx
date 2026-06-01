import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  buildEmailHtmlDocument,
  emailHasOwnDarkMode,
  processEmailHtml,
} from "@workspace/calendar-core";

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

/**
 * Injected after page load:
 *  1. Scales wide (table-heavy) emails down to fit device width using CSS transform.
 *  2. Reports the resulting visual height back via postMessage so the host View
 *     can resize to exactly match the content — enabling a single outer ScrollView
 *     with no internal WebView scroll (the Vymo/auto-height approach).
 */
const FIT_AND_REPORT_SCRIPT = `
(function() {
  function run() {
    var dw = window.innerWidth;
    var bw = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
    var scale = 1;
    if (bw > dw + 4) {
      scale = dw / bw;
      document.body.style.cssText += ';transform:scale(' + scale + ');transform-origin:0 0;width:' + bw + 'px;';
      document.documentElement.style.overflow = 'hidden';
    }
    var rawH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    var h = Math.ceil(rawH * scale);
    window.ReactNativeWebView.postMessage('h:' + h);
  }
  if (document.readyState === 'complete') { run(); }
  else { window.addEventListener('load', run); }
  true;
})();
`;

interface HtmlEmailViewProps {
  html: string;
  isDark: boolean;
  blockRemoteImages?: boolean;
  blockTrackingPixels?: boolean;
  style?: ViewStyle;
}

export function HtmlEmailView({
  html,
  isDark,
  blockRemoteImages = false,
  blockTrackingPixels = true,
  style,
}: HtmlEmailViewProps) {
  const [webViewHeight, setWebViewHeight] = useState(400);
  const [isLoaded, setIsLoaded] = useState(false);

  const document = useMemo(() => {
    const processedHtml = processEmailHtml({
      html,
      isDark,
      blockTrackingPixels,
      blockRemoteImages,
    });
    return buildEmailHtmlDocument({
      processedHtml,
      isDark,
      blockRemoteImages,
      hasOwnDark: emailHasOwnDarkMode(html),
      mobileViewport: true,
    });
  }, [html, isDark, blockTrackingPixels, blockRemoteImages]);

  const fallbackText = useMemo(() => stripToPlainText(html), [html]);

  if (!WebView) {
    return (
      <View style={[styles.fallback, isDark && styles.fallbackDark, style]}>
        <Text style={[styles.fallbackText, isDark && styles.fallbackTextDark]}>
          {fallbackText}
        </Text>
      </View>
    );
  }

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = event.nativeEvent.data;
    if (msg.startsWith("h:")) {
      const h = parseInt(msg.slice(2), 10);
      if (!isNaN(h) && h > 20) setWebViewHeight(h);
    }
  };

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    const url = request.url;
    if (url === "about:blank" || url.startsWith("data:")) return true;
    if (/^https?:/i.test(url)) {
      WebBrowser.openBrowserAsync(url).catch(() => {});
      return false;
    }
    return false;
  };

  const bg = isDark ? "#1a1a1a" : "#ffffff";

  return (
    <View style={[{ height: webViewHeight }, style]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: document }}
        injectedJavaScript={FIT_AND_REPORT_SCRIPT}
        onMessage={onMessage}
        onLoad={() => setIsLoaded(true)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}
        backgroundColor={bg}
      />
      {!isLoaded && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.loader,
            { backgroundColor: bg },
          ]}
        >
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

function stripToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const styles = StyleSheet.create({
  fallback: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
  },
  fallbackDark: {
    backgroundColor: "#1a1a1a",
  },
  fallbackText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#111",
  },
  fallbackTextDark: {
    color: "#e0e0e0",
  },
  loader: {
    alignItems: "center",
    justifyContent: "center",
  },
});
