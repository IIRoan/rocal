import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import type { ThemeTokens } from "@workspace/design-tokens";
import { getErrorMessage } from "@workspace/calendar-core";
import type { MailAttachmentPreviewKind } from "../../lib/mail/attachment-preview";
import type { CachedAttachment } from "../../lib/mail/attachment-cache";
import { CenteredLoader } from "../ui/loading";

const SHEET_HEIGHT_FRACTION = 0.8;

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
  loadCached: () => Promise<CachedAttachment>;
  onClose: () => void;
  onShare: (cached: CachedAttachment) => void;
  onOpen?: (cached: CachedAttachment) => void;
}

export function AttachmentPreviewModal({
  visible,
  name,
  kind,
  theme,
  isDark,
  loadCached,
  onClose,
  onShare,
  onOpen,
}: AttachmentPreviewModalProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * SHEET_HEIGHT_FRACTION;
  const [cached, setCached] = useState<CachedAttachment | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const canOpenExternally = kind === "image" || kind === "pdf";

  useEffect(() => {
    if (!visible) {
      setCached(null);
      setTextContent(null);
      setError(null);
      setIsLoading(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const result = await loadCached();
        if (cancelled) return;
        setCached(result);
        if (kind === "text") {
          const content = await FileSystem.readAsStringAsync(result.uri);
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
  }, [visible, kind, loadCached]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
        />
        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: insets.bottom,
            },
          ]}
        >
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
            <View style={styles.headerActions}>
              {canOpenExternally && onOpen ? (
                <Pressable
                  onPress={() => cached && onOpen(cached)}
                  disabled={!cached}
                  style={styles.iconButton}
                  accessibilityLabel="Open in another app"
                >
                  <Feather
                    name="external-link"
                    size={20}
                    color={
                      cached ? theme.colors.foreground : theme.colors.mutedForeground
                    }
                  />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => cached && onShare(cached)}
                disabled={!cached}
                style={styles.iconButton}
                accessibilityLabel="Share attachment"
              >
                <Feather
                  name="share"
                  size={20}
                  color={cached ? theme.colors.foreground : theme.colors.mutedForeground}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.content}>
            {isLoading ? (
              <CenteredLoader theme={theme} />
            ) : error ? (
              <View style={styles.centered}>
                <Feather
                  name="alert-triangle"
                  size={32}
                  color={theme.colors.destructive}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : kind === "image" && cached ? (
              <>
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.imageScroll}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  centerContent
                >
                  <Image
                    source={{ uri: cached.uri }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </ScrollView>
                {onOpen ? (
                  <View style={styles.footer}>
                    <Pressable
                      onPress={() => onOpen(cached)}
                      style={styles.openButton}
                    >
                      <Text style={styles.openButtonText}>Open in another app</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : kind === "text" && textContent !== null ? (
              <ScrollView style={styles.flex} contentContainerStyle={styles.textScroll}>
                <Text style={styles.textBody}>{textContent}</Text>
              </ScrollView>
            ) : kind === "pdf" && cached && WebView ? (
              <>
                <WebView
                  originWhitelist={["*"]}
                  source={{ uri: cached.uri }}
                  style={styles.flex}
                  backgroundColor={isDark ? "#1a1a1a" : "#ffffff"}
                  allowFileAccess
                  allowFileAccessFromFileURLs
                  allowingReadAccessToURL={cached.uri}
                />
                {onOpen ? (
                  <View style={styles.footer}>
                    <Pressable
                      onPress={() => onOpen(cached)}
                      style={styles.openButton}
                    >
                      <Text style={styles.openButtonText}>Open in another app</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.centered}>
                <Feather name="file" size={40} color={theme.colors.mutedForeground} />
                <Text style={styles.mutedText}>
                  Preview not available for this file.
                </Text>
                {cached && onOpen ? (
                  <Pressable onPress={() => onOpen(cached)} style={styles.openButton}>
                    <Text style={styles.openButtonText}>Open</Text>
                  </Pressable>
                ) : cached ? (
                  <Pressable onPress={() => onShare(cached)} style={styles.openButton}>
                    <Text style={styles.openButtonText}>Share</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.42)",
    },
    sheet: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      overflow: "hidden",
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
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    footer: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    content: {
      flex: 1,
      minHeight: 0,
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
      minHeight: 200,
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
