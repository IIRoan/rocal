import { useCallback, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import {
  resolveComposeContext,
  useMailAccount,
  useMailRuntime,
  useSendMessage,
} from "../../../src/lib/mail/use-mail";
import { validateComposeInput } from "../../../src/lib/mail/mail-helpers";

export default function ComposeScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const sendMessage = useSendMessage(runtime);

  const composeContext = resolveComposeContext(runtime);

  const [to, setTo] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

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
