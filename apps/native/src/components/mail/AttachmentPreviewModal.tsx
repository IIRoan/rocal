import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import type { ThemeTokens } from "@workspace/design-tokens";
import { getErrorMessage } from "@workspace/calendar-core";
import type { MailAttachmentPreviewKind } from "../../lib/mail/attachment-preview";

type WebViewModule = typeof import("react-native-webview");
type WebViewComponent = WebViewModule["WebView"];

let WebView: WebViewComponent | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebView = (require("react-native-webview") as WebViewModule).WebView;
} catch {
  WebView = null;
}

interface AttachmentPreviewModalProps {
  visible: boolean;
  name: string;
  kind: MailAttachmentPreviewKind;
  theme: ThemeTokens;
  isDark: boolean;
  /** Downloads the blob to a local cache file and resolves its file:// uri. */
  loadUri: () => Promise<string>;
  onClose: () => void;
  onShare: (uri: string) => void;
}

export function AttachmentPreviewModal({
  visible,
  name,
  kind,
  theme,
  isDark,
  loadUri,
  onClose,
  onShare,
}: AttachmentPreviewModalProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [uri, setUri] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!visible) {
      setUri(null);
      setTextContent(null);
      setError(null);
      setIsLoading(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const localUri = await loadUri();
        if (cancelled) return;
        setUri(localUri);
        if (kind === "text") {
          const content = await FileSystem.readAsStringAsync(localUri);
          if (!cancelled) setTextContent(content);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Could not load attachment."));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, kind, loadUri]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.iconButton}
            accessibilityLabel="Close preview"
          >
            <Feather name="x" size={22} color={theme.colors.foreground} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Pressable
            onPress={() => uri && onShare(uri)}
            disabled={!uri}
            style={styles.iconButton}
            accessibilityLabel="Share attachment"
          >
            <Feather
              name="share"
              size={20}
              color={uri ? theme.colors.foreground : theme.colors.mutedForeground}
            />
          </Pressable>
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.colors.primaryBase} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Feather
                name="alert-triangle"
                size={32}
                color={theme.colors.destructive}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : kind === "image" && uri ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.imageScroll}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
            >
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
              />
            </ScrollView>
          ) : kind === "text" && textContent !== null ? (
            <ScrollView style={styles.flex} contentContainerStyle={styles.textScroll}>
              <Text style={styles.textBody}>{textContent}</Text>
            </ScrollView>
          ) : kind === "pdf" && uri && WebView ? (
            <WebView
              originWhitelist={["*"]}
              source={{ uri }}
              style={styles.flex}
              javaScriptEnabled={false}
              backgroundColor={isDark ? "#1a1a1a" : "#ffffff"}
            />
          ) : (
            <View style={styles.centered}>
              <Feather name="file" size={40} color={theme.colors.mutedForeground} />
              <Text style={styles.mutedText}>
                Preview not available for this file.
              </Text>
              {uri && (
                <Pressable onPress={() => onShare(uri)} style={styles.openButton}>
                  <Text style={styles.openButtonText}>Open</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingTop: theme.spacing["2"],
      paddingBottom: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.semibold as "600",
      color: theme.colors.foreground,
    },
    content: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    imageScroll: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    image: {
      width: "100%",
      height: "100%",
      minHeight: 300,
    },
    textScroll: {
      padding: theme.spacing["4"],
    },
    textBody: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      fontFamily: "Courier",
    },
    errorText: {
      textAlign: "center",
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
    mutedText: {
      textAlign: "center",
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    openButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    openButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.semibold as "600",
      color: theme.colors.primaryForeground,
    },
  });
}
