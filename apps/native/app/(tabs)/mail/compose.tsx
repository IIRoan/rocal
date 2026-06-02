import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  useCachedMessage,
  resolveComposeContext,
  useMailAccount,
  useMailRuntime,
  useSendMessage,
} from "../../../src/lib/mail/use-mail";
import { validateComposeInput } from "../../../src/lib/mail/mail-helpers";
import { extractMessageBodies } from "../../../src/lib/mail/message-security";
import type { JmapEmailMessage } from "../../../src/lib/mail/types";

export default function ComposeScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    messageId?: string;
  }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const sendMessage = useSendMessage(runtime);
  const cachedMessage = useCachedMessage(params.messageId ?? "");

  const composeContext = resolveComposeContext(runtime);

  const [to, setTo] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasInitializedFromParams, setHasInitializedFromParams] =
    useState(false);

  const sourceMessageQuery = useQuery<JmapEmailMessage | null>({
    queryKey: QUERY_KEYS.mailMessage(params.messageId ?? ""),
    enabled:
      Boolean(params.messageId) && Boolean(runtime) && !Boolean(cachedMessage),
    queryFn: async () => {
      const list = await runtime!.client.getMessagesByIds(runtime!.session, [
        params.messageId!,
      ]);
      return list[0] ?? null;
    },
    initialData: cachedMessage ?? undefined,
  });
  const sourceMessage = sourceMessageQuery.data ?? cachedMessage ?? null;

  const handleSend = useCallback(() => {
    setError(null);
    const validation = validateComposeInput({ to, cc, bcc, subject });
    const firstError =
      validation.errors.to ??
      validation.errors.recipients ??
      validation.errors.subject;
    if (firstError) {
      setError(firstError);
      return;
    }

    sendMessage.mutate(
      {
        to: validation.to,
        cc: validation.cc,
        bcc: validation.bcc,
        subject: subject.trim(),
        textBody: body,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) =>
          setError(getErrorMessage(err, "Failed to send message")),
      },
    );
  }, [to, cc, bcc, subject, body, sendMessage, router]);

  const canSend = Boolean(composeContext) && !sendMessage.isPending;

  useEffect(() => {
    if (hasInitializedFromParams || !sourceMessage) {
      return;
    }

    if (params.mode === "reply") {
      setTo(getReplyRecipients(sourceMessage));
      setSubject(prefixSubject(sourceMessage.subject, "Re:"));
      setBody(buildReplyBody(sourceMessage));
    } else if (params.mode === "forward") {
      setSubject(prefixSubject(sourceMessage.subject, "Fwd:"));
      setBody(buildForwardBody(sourceMessage));
    }

    setHasInitializedFromParams(true);
  }, [hasInitializedFromParams, params.mode, sourceMessage]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Feather name="x" size={22} color={theme.colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>New message</Text>
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sendMessage.isPending ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryForeground}
            />
          ) : (
            <Feather
              name="send"
              size={16}
              color={theme.colors.primaryForeground}
            />
          )}
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {composeContext ? (
            <View style={styles.fromRow}>
              <Text style={styles.fromLabel}>From</Text>
              <Text style={styles.fromValue} numberOfLines={1}>
                {composeContext.fromEmail}
              </Text>
            </View>
          ) : runtimeQuery.isLoading ? (
            <View style={styles.fromRow}>
              <ActivityIndicator
                size="small"
                color={theme.colors.mutedForeground}
              />
              <Text style={styles.fromValue}>Preparing your mailbox…</Text>
            </View>
          ) : (
            <Text style={styles.noticeText}>
              Your mailbox cannot send messages right now.
            </Text>
          )}

          <Field
            theme={theme}
            label="To"
            value={to}
            onChangeText={setTo}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoFocus
            trailing={
              <Pressable
                onPress={() => setShowCcBcc((prev) => !prev)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Toggle Cc and Bcc"
              >
                <Text style={styles.ccToggle}>
                  {showCcBcc ? "Hide" : "Cc/Bcc"}
                </Text>
              </Pressable>
            }
          />

          {showCcBcc ? (
            <>
              <Field
                theme={theme}
                label="Cc"
                value={cc}
                onChangeText={setCc}
                placeholder="name@example.com"
                keyboardType="email-address"
              />
              <Field
                theme={theme}
                label="Bcc"
                value={bcc}
                onChangeText={setBcc}
                placeholder="name@example.com"
                keyboardType="email-address"
              />
            </>
          ) : null}

          <Field
            theme={theme}
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
          />

          <TextInput
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Write your message…"
            placeholderTextColor={theme.colors.mutedForeground}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Message body"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function prefixSubject(
  value: string | null | undefined,
  prefix: "Re:" | "Fwd:",
) {
  const normalized = value?.trim() || "(no subject)";
  return normalized.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalized
    : `${prefix} ${normalized}`;
}

function getReplyRecipients(message: JmapEmailMessage): string {
  return (message.from ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function buildReplyBody(message: JmapEmailMessage): string {
  const sender =
    message.from?.[0]?.name?.trim() ||
    message.from?.[0]?.email?.trim() ||
    "Unknown sender";
  const receivedAt = message.receivedAt
    ? new Date(message.receivedAt).toLocaleString()
    : "Unknown date";
  const bodies = extractMessageBodies(message);
  const source = bodies.text?.trim() || stripHtmlToText(bodies.html);
  const quoted = source
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");

  return `\n\nOn ${receivedAt}, ${sender} wrote:\n${quoted}`;
}

function buildForwardBody(message: JmapEmailMessage): string {
  const bodies = extractMessageBodies(message);
  const textBody = bodies.text?.trim() || stripHtmlToText(bodies.html);
  const from = getReplyRecipients(message) || "Unknown sender";
  const to = (message.to ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const cc = (message.cc ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const date = message.receivedAt
    ? new Date(message.receivedAt).toLocaleString()
    : "Unknown date";

  return [
    "",
    "",
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${date}`,
    ...(to ? [`To: ${to}`] : []),
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    "",
    textBody,
  ].join("\n");
}

function stripHtmlToText(html: string | null | undefined): string {
  if (!html) {
    return "";
  }

  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function Field({
  theme,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  trailing,
}: {
  theme: ThemeTokens;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "email-address" | "default";
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? "default"}
        autoFocus={autoFocus}
      />
      {trailing}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconButton: {
      width: 38,
      height: 38,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    sendButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    body: {
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
    },
    fromRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingBottom: theme.spacing["1"],
    },
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sendButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    fromLabel: {
      width: 56,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    fromValue: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    fieldLabel: {
      width: 56,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    fieldInput: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      paddingVertical: theme.spacing["1"],
    },
    ccToggle: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
    noticeText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      marginTop: theme.spacing["2"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
    bodyInput: {
      minHeight: 200,
      marginTop: theme.spacing["2"],
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
