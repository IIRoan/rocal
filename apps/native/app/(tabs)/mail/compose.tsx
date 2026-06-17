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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { AppScreen, NavigationHeader } from "../../../src/components/layout";
import {
  layoutFormContent,
  layoutFormFieldBorder,
} from "../../../src/lib/app-layout";
import { useQuery } from "@tanstack/react-query";
import { getErrorMessage, resolveReplyRecipients } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  useCachedMessage,
  resolveComposeContext,
  useMailAccount,
  useMailRuntime,
  useSendMessage,
} from "../../../src/lib/mail/use-mail";
import { validateComposeInput } from "../../../src/lib/mail/mail-helpers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveInlinePgpArmoredCiphertext,
} from "../../../src/lib/mail/message-security";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
} from "../../../src/lib/mail/mail-crypto";
import { resolveOutgoingMessageBody } from "../../../src/lib/mail/outgoing-message-crypto";
import {
  appendPlainTextSignature,
  getPlainTextSignature,
} from "../../../src/lib/mail/signature-utils";
import {
  useComposeDraftAutosave,
  type DraftSaveStatus,
} from "../../../src/hooks/use-compose-draft-autosave";
import type { JmapEmailMessage, JmapIdentity, MailAddress } from "../../../src/lib/mail/types";

export default function ComposeScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    messageId?: string;
    to?: string;
    toName?: string;
  }>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { toast } = useToast();

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const sendMessage = useSendMessage(runtime);
  const cachedMessage = useCachedMessage(params.messageId ?? "");

  const [to, setTo] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasInitializedFromParams, setHasInitializedFromParams] =
    useState(false);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(
    null,
  );
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>("idle");
  const [isDraftDecrypting, setIsDraftDecrypting] = useState(false);

  const composeContext = resolveComposeContext(
    runtime,
    selectedIdentityId ?? undefined,
  );
  const identities = runtime?.identities ?? [];

  useEffect(() => {
    if (!selectedIdentityId && identities[0]?.id) {
      setSelectedIdentityId(identities[0].id);
    }
  }, [identities, selectedIdentityId]);

  const { saveDraft } = useComposeDraftAutosave({
    runtime,
    enabled: Boolean(composeContext),
    to,
    cc,
    bcc,
    subject,
    body,
    identityId: selectedIdentityId,
    draftId,
    setDraftId,
    setDraftSaveStatus,
  });

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

  const selectedIdentity = useMemo(
    () =>
      identities.find((entry) => entry.id === selectedIdentityId) ??
      identities[0] ??
      null,
    [identities, selectedIdentityId],
  );

  const handleSend = useCallback(async () => {
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

    const bodyWithSignature = appendPlainTextSignature(body, selectedIdentity);
    const allRecipients = [
      ...validation.to,
      ...validation.cc,
      ...validation.bcc,
    ];

    try {
      const { textBody, encrypted } = runtime
        ? await resolveOutgoingMessageBody({
            runtime,
            recipients: allRecipients,
            plaintext: bodyWithSignature,
          })
        : { textBody: bodyWithSignature, encrypted: false };
      const savedDraftId = await saveDraft();

      sendMessage.mutate(
        {
          to: validation.to,
          cc: validation.cc,
          bcc: validation.bcc,
          subject: subject.trim(),
          textBody,
          identityId: selectedIdentityId,
          previousDraftId: savedDraftId ?? draftId,
        },
        {
          onSuccess: () => {
            toast(encrypted ? "Encrypted message sent" : "Message sent");
            router.back();
          },
          onError: (err) =>
            setError(getErrorMessage(err, "Failed to send message")),
        },
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to send message"));
    }
  }, [
    to,
    cc,
    bcc,
    subject,
    body,
    selectedIdentity,
    selectedIdentityId,
    draftId,
    runtime,
    saveDraft,
    sendMessage,
    router,
    toast,
  ]);

  const handleInsertSignature = useCallback(() => {
    const signature = getPlainTextSignature(selectedIdentity);
    if (!signature) return;
    setBody((current) => appendPlainTextSignature(current, selectedIdentity));
  }, [selectedIdentity]);

  const handleClose = useCallback(async () => {
    await saveDraft();
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
    setError(null);
    setDraftId(null);
    setDraftSaveStatus("idle");
    setShowCcBcc(false);
    setHasInitializedFromParams(false);
    router.back();
  }, [router, saveDraft]);

  const handleClear = useCallback(() => {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBody("");
    setError(null);
    setDraftId(null);
    setDraftSaveStatus("idle");
    setShowCcBcc(false);
  }, []);

  const canSend =
    Boolean(composeContext) && !sendMessage.isPending && !isDraftDecrypting;

  useEffect(() => {
    if (hasInitializedFromParams) {
      return;
    }

    const toParam = Array.isArray(params.to) ? params.to[0] : params.to;
    if (toParam) {
      const toName = Array.isArray(params.toName)
        ? params.toName[0]
        : params.toName;
      const trimmedName = toName?.trim();
      setTo(
        trimmedName && trimmedName.toLowerCase() !== toParam.toLowerCase()
          ? `${trimmedName} <${toParam}>`
          : toParam,
      );
      setHasInitializedFromParams(true);
      return;
    }

    if (!sourceMessage) {
      return;
    }

    if (params.mode === "reply") {
      setTo(
        getReplyRecipients(
          sourceMessage,
          composeContext?.fromEmail ?? runtime?.session.username ?? null,
        ),
      );
      setSubject(prefixSubject(sourceMessage.subject, "Re:"));
      setBody(buildReplyBody(sourceMessage));
    } else if (params.mode === "forward") {
      setSubject(prefixSubject(sourceMessage.subject, "Fwd:"));
      setBody(buildForwardBody(sourceMessage));
    } else if (params.mode === "draft") {
      setTo(formatAddressList(sourceMessage.to));
      setCc(formatAddressList(sourceMessage.cc));
      setBcc(formatAddressList(sourceMessage.bcc));
      setSubject(sourceMessage.subject ?? "");
      setDraftId(sourceMessage.id);
      if (sourceMessage.cc?.length || sourceMessage.bcc?.length) {
        setShowCcBcc(true);
      }

      const encryption = classifyMessageEncryption(sourceMessage);
      if (encryption === "inline_pgp" || encryption === "pgp_mime") {
        if (!runtime) {
          return;
        }

        let cancelled = false;
        setIsDraftDecrypting(true);
        void (async () => {
          try {
            let plaintext = "";
            if (encryption === "inline_pgp") {
              const armoredMessage = await resolveInlinePgpArmoredCiphertext({
                message: sourceMessage,
                fetchBlob: (blobId) =>
                  runtime.client.getBlobAsText(runtime.session, blobId),
              });
              const decrypted = await decryptMailMessage(
                runtime,
                sourceMessage.id,
                armoredMessage,
              );
              plaintext = decrypted.plaintext;
            } else {
              const decrypted = await decryptPgpMimeMessage(
                runtime,
                sourceMessage.id,
                sourceMessage.bodyStructure,
              );
              plaintext = decrypted.plaintext;
            }
            if (!cancelled) {
              setBody(plaintext);
            }
          } catch (err) {
            if (!cancelled) {
              setError(
                getErrorMessage(err, "Could not decrypt this draft."),
              );
              setBody("");
            }
          } finally {
            if (!cancelled) {
              setIsDraftDecrypting(false);
              setHasInitializedFromParams(true);
            }
          }
        })();

        return () => {
          cancelled = true;
        };
      }

      const bodies = extractMessageBodies(sourceMessage);
      setBody(bodies.text?.trim() || stripHtmlToText(bodies.html));
    }

    setHasInitializedFromParams(true);
  }, [
    composeContext?.fromEmail,
    hasInitializedFromParams,
    params.mode,
    params.to,
    params.toName,
    runtime,
    sourceMessage,
  ]);

  return (
    <AppScreen
      header={
        <NavigationHeader
          variant="compose"
          title={draftId ? "Draft" : "New message"}
          onBack={() => void handleClose()}
          trailing={
            <View style={styles.headerActions}>
              <Pressable
                onPress={handleClear}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear compose"
              >
                <Text style={styles.clearButton}>Clear</Text>
              </Pressable>
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
          }
        />
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {composeContext ? (
            <Pressable
              style={styles.fromRow}
              onPress={
                identities.length > 1
                  ? () => setIdentityPickerOpen(true)
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel="Choose sending identity"
            >
              <Text style={styles.fromLabel}>From</Text>
              <Text style={styles.fromValue} numberOfLines={1}>
                {composeContext.fromName
                  ? `${composeContext.fromName} <${composeContext.fromEmail}>`
                  : composeContext.fromEmail}
              </Text>
              {identities.length > 1 ? (
                <Feather
                  name="chevron-down"
                  size={16}
                  color={theme.colors.mutedForeground}
                />
              ) : null}
            </Pressable>
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

          <View style={styles.composeToolbar}>
            {getPlainTextSignature(selectedIdentity) ? (
              <Pressable
                onPress={handleInsertSignature}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Insert signature"
              >
                <Text style={styles.ccToggle}>Insert signature</Text>
              </Pressable>
            ) : null}
            {draftSaveStatus === "saving" ? (
              <Text style={styles.draftStatus}>Saving draft…</Text>
            ) : draftSaveStatus === "saved" ? (
              <Text style={styles.draftStatus}>Draft saved</Text>
            ) : draftSaveStatus === "error" ? (
              <Text style={styles.draftStatusError}>Draft save failed</Text>
            ) : null}
          </View>

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

      <BottomSheet
        visible={identityPickerOpen}
        onDismiss={() => setIdentityPickerOpen(false)}
        snapPoints={[0.45]}
      >
        <View style={styles.identitySheetHeader}>
          <Text style={styles.identitySheetTitle}>Send from</Text>
        </View>
        {identities.map((identity) => (
          <IdentityPickerRow
            key={identity.id}
            identity={identity}
            selected={identity.id === selectedIdentityId}
            theme={theme}
            onSelect={() => {
              setSelectedIdentityId(identity.id);
              setIdentityPickerOpen(false);
            }}
          />
        ))}
      </BottomSheet>
    </AppScreen>
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

function formatAddressList(addresses: MailAddress[] | undefined): string {
  return (addresses ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function getReplyRecipients(
  message: JmapEmailMessage,
  currentUserEmail?: string | null,
): string {
  return resolveReplyRecipients({
    from: message.from,
    to: message.to,
    cc: message.cc,
    currentUserEmail,
  }).join(", ");
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

  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function IdentityPickerRow({
  identity,
  selected,
  theme,
  onSelect,
}: {
  identity: JmapIdentity;
  selected: boolean;
  theme: ThemeTokens;
  onSelect: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const label = identity.name?.trim()
    ? `${identity.name} <${identity.email}>`
    : identity.email;
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.identityRow, selected && styles.identityRowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={styles.identityLabel} numberOfLines={2}>
        {label}
      </Text>
      {selected ? (
        <Feather name="check" size={16} color={theme.colors.primaryBase} />
      ) : null}
    </Pressable>
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
    flex: {
      flex: 1,
    },
    headerActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
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
    body: layoutFormContent(theme),
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
      ...layoutFormFieldBorder(theme),
      paddingVertical: theme.spacing["2"],
    },
    composeToolbar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginTop: theme.spacing["2"],
      minHeight: 24,
    },
    identityRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    identityRowSelected: {
      backgroundColor: theme.colors.muted,
    },
    identitySheetHeader: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    clearButton: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
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
    draftStatus: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    draftStatusError: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.destructive,
    },
    identityLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    identitySheetTitle: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
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
