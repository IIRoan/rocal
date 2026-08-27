import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { AppScreen, HeaderIconButton, NavigationHeader } from "../../../src/components/layout";
import { LAYOUT_METRICS } from "../../../src/lib/app-layout";
import { useQuery } from "@tanstack/react-query";
import { getErrorMessage, resolveReplyRecipients, validateComposeRecipients, resolveComposeSendBodies, messageBodiesToComposeText } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "../../../src/components/BottomSheet";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  useCachedMessage,
  resolveComposeContext,
  useMailAccount,
  useMailMutations,
  useMailRuntime,
  useSendMessage,
} from "../../../src/lib/mail/use-mail";
import {
  formatReplyAllRecipientFields,
  validateComposeInput,
} from "../../../src/lib/mail/mail-helpers";
import {
  createPendingComposeAttachment,
  formatAttachmentSize,
  toJmapAttachmentInput,
  type PendingComposeAttachment,
} from "../../../src/lib/mail/compose-attachments";
import { decodeBase64ToBytes } from "../../../src/lib/mail/binary-utils";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
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
import { ComposeRecipientField } from "../../../src/components/mail/ComposeRecipientField";
import { ComposeBodyEditor, type ComposeBodyEditorHandle } from "../../../src/components/mail/ComposeBodyEditor";
import { useRecentContacts } from "../../../src/hooks/use-recent-contacts";
import { extractRecentContactEntries } from "../../../src/lib/record-recent-contacts";
import { collectCommittedEmails } from "../../../src/lib/mail/compose-recipients";
import { useKeyboardInset } from "../../../src/hooks/use-keyboard-inset";

export default function ComposeScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset();
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
  const { moveToTrash } = useMailMutations(runtime, null);
  const { recordUsage } = useRecentContacts();
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
  const [attachments, setAttachments] = useState<PendingComposeAttachment[]>(
    [],
  );
  const [isDraftDecrypting, setIsDraftDecrypting] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const bodyEditorRef = useRef<ComposeBodyEditorHandle>(null);

  const composeContext = resolveComposeContext(
    runtime,
    selectedIdentityId ?? undefined,
  );
  const identities = runtime?.pickerIdentities ?? [];

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
    const { plaintext, htmlBody: unencryptedHtml } = resolveComposeSendBodies({
      body,
      bodyWithSignature,
      encrypted: false,
    });
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
            plaintext,
          })
        : { textBody: plaintext, encrypted: false };
      const htmlBody = encrypted ? undefined : unencryptedHtml;

      const uploadedAttachments = [];
      if (runtime && attachments.length > 0) {
        for (const pending of attachments) {
          const uploaded = await runtime.client.uploadBlob(
            runtime.session,
            pending.bytes,
            pending.type,
          );
          uploadedAttachments.push(
            toJmapAttachmentInput(pending, uploaded.blobId),
          );
        }
      }

      const savedDraftId = await saveDraft();

      sendMessage.mutate(
        {
          to: validation.to,
          cc: validation.cc,
          bcc: validation.bcc,
          subject: subject.trim(),
          textBody,
          htmlBody,
          identityId: selectedIdentityId,
          previousDraftId: savedDraftId ?? draftId,
          attachments:
            uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        },
        {
          onSuccess: () => {
            const recipientValidation = validateComposeRecipients({
              to,
              cc,
              bcc,
              subject,
            });
            const entries = extractRecentContactEntries(
              [
                ...recipientValidation.to.map((address) => ({
                  email: address.email,
                  displayName: address.name ?? null,
                })),
                ...recipientValidation.cc.map((address) => ({
                  email: address.email,
                  displayName: address.name ?? null,
                })),
                ...recipientValidation.bcc.map((address) => ({
                  email: address.email,
                  displayName: address.name ?? null,
                })),
              ],
              composeContext?.fromEmail,
            );
            if (entries.length > 0) {
              recordUsage(entries, "mail");
            }
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
    composeContext,
    recordUsage,
    router,
    toast,
    attachments,
  ]);

  const handleInsertSignature = useCallback(() => {
    const signature = getPlainTextSignature(selectedIdentity);
    if (!signature) return;
    setBody((current) => appendPlainTextSignature(current, selectedIdentity));
  }, [selectedIdentity]);

  const handleAttach = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = decodeBase64ToBytes(base64);
      setAttachments((current) => [
        ...current,
        createPendingComposeAttachment({
          name: asset.name ?? "attachment",
          type: asset.mimeType,
          bytes,
        }),
      ]);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to attach file."));
    }
  }, []);

  const isDirty = Boolean(
    to.trim() ||
      cc.trim() ||
      bcc.trim() ||
      subject.trim() ||
      body.trim() ||
      attachments.length > 0 ||
      draftId,
  );

  const leaveCompose = useCallback(() => {
    router.back();
  }, [router]);

  const handleDiscard = useCallback(() => {
    if (draftId && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  }, [draftId, leaveCompose, moveToTrash, runtime]);

  const handleSaveAndLeave = useCallback(async () => {
    await saveDraft();
    leaveCompose();
  }, [leaveCompose, saveDraft]);

  const handleCancel = useCallback(() => {
    if (!isDirty) {
      leaveCompose();
      return;
    }

    Alert.alert("Draft", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete Draft",
        style: "destructive",
        onPress: handleDiscard,
      },
      {
        text: "Save Draft",
        onPress: () => {
          void handleSaveAndLeave();
        },
      },
    ]);
  }, [handleDiscard, handleSaveAndLeave, isDirty, leaveCompose]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleCancel();
        return true;
      },
    );
    return () => subscription.remove();
  }, [handleCancel]);

  const canSend =
    Boolean(composeContext) &&
    !sendMessage.isPending &&
    !isDraftDecrypting &&
    to.trim().length > 0;

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
    } else if (params.mode === "reply-all") {
      const fields = formatReplyAllRecipientFields(
        sourceMessage,
        composeContext?.fromEmail ?? runtime?.session.username ?? null,
      );
      setTo(fields.to);
      setCc(fields.cc);
      if (fields.cc) {
        setShowCcBcc(true);
      }
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
      setBody(messageBodiesToComposeText(bodies));
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

  const hasSignature = Boolean(getPlainTextSignature(selectedIdentity));
  const toExcludeEmails = useMemo(() => collectCommittedEmails(cc, bcc), [bcc, cc]);
  const ccExcludeEmails = useMemo(() => collectCommittedEmails(to, bcc), [bcc, to]);
  const bccExcludeEmails = useMemo(() => collectCommittedEmails(to, cc), [cc, to]);
  const showFormatBar = bodyFocused;
  const formatBar = (
    <ComposeFormatBar
      theme={theme}
      styles={styles}
      draftSaveStatus={draftSaveStatus}
      hasSignature={hasSignature}
      onBold={() => bodyEditorRef.current?.applyBold()}
      onItalic={() => bodyEditorRef.current?.applyItalic()}
      onUnderline={() => bodyEditorRef.current?.applyUnderline()}
      onList={() => bodyEditorRef.current?.applyList()}
      onInsertSignature={handleInsertSignature}
    />
  );

  return (
    <AppScreen
      header={
        <NavigationHeader
          variant="compose"
          title={draftId ? "Draft" : "New Message"}
          onBack={handleCancel}
          trailing={
            <View style={styles.headerTrailing}>
              <HeaderIconButton
                name="paperclip"
                onPress={() => {
                  void handleAttach();
                }}
                accessibilityLabel="Attach file"
              />
              {sendMessage.isPending ? (
                <View style={styles.sendPending}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primaryBase}
                  />
                </View>
              ) : (
                <HeaderIconButton
                  name="send"
                  onPress={() => {
                    void handleSend();
                  }}
                  disabled={!canSend}
                  color={
                    canSend
                      ? theme.colors.primaryBase
                      : theme.colors.mutedForeground
                  }
                  accessibilityLabel="Send"
                />
              )}
            </View>
          }
        />
      }
    >
      <View
        style={[
          styles.composeShell,
          { paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom },
        ]}
      >
        <View style={styles.flex}>
        <View style={styles.headerFields}>
          {runtimeQuery.isLoading && !composeContext ? (
            <View style={styles.fromRow}>
              <ActivityIndicator
                size="small"
                color={theme.colors.mutedForeground}
              />
              <Text style={styles.fromValue}>Preparing your mailbox…</Text>
            </View>
          ) : null}

          {!runtimeQuery.isLoading && !composeContext ? (
            <Text style={styles.noticeText}>
              Your mailbox cannot send messages right now.
            </Text>
          ) : null}

          <ComposeRecipientField
            value={to}
            onChangeText={setTo}
            placeholder="To"
            excludeEmails={toExcludeEmails}
            trailing={
              <Pressable
                onPress={() => setShowCcBcc((prev) => !prev)}
                hitSlop={8}
                style={styles.ccToggleHit}
                accessibilityRole="button"
                accessibilityLabel={
                  showCcBcc ? "Hide Cc, Bcc, and From" : "Show Cc, Bcc, and From"
                }
              >
                <Feather
                  name={showCcBcc ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            }
          />

          {showCcBcc ? (
            <>
              <ComposeRecipientField
                value={cc}
                onChangeText={setCc}
                placeholder="Cc"
                excludeEmails={ccExcludeEmails}
              />
              <ComposeRecipientField
                value={bcc}
                onChangeText={setBcc}
                placeholder="Bcc"
                excludeEmails={bccExcludeEmails}
              />
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
                      ? `${composeContext.fromName}`
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
              ) : null}
            </>
          ) : null}

          <TextInput
            style={styles.subjectInput}
            value={subject}
            onChangeText={setSubject}
            onFocus={() => setBodyFocused(false)}
            placeholder="Subject"
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="sentences"
            autoCorrect
            autoFocus={false}
            accessibilityLabel="Subject"
          />

          {attachments.length > 0 ? (
            <View style={styles.attachmentList}>
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentChip}>
                  <Feather
                    name="paperclip"
                    size={12}
                    color={theme.colors.mutedForeground}
                  />
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {attachment.name} ({formatAttachmentSize(attachment.size)})
                  </Text>
                  <Pressable
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${attachment.name}`}
                  >
                    <Feather
                      name="x"
                      size={14}
                      color={theme.colors.mutedForeground}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {isDraftDecrypting ? (
          <View style={styles.bodyLoading}>
            <ActivityIndicator
              size="small"
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.draftStatus}>Decrypting draft…</Text>
          </View>
        ) : (
          <ComposeBodyEditor
            ref={bodyEditorRef}
            value={body}
            onChangeText={setBody}
            onFocusChange={setBodyFocused}
            placeholder="Message"
          />
        )}
        </View>

        {showFormatBar ? formatBar : null}
        {keyboardHeight > 0 ? (
          <View style={{ height: keyboardHeight }} />
        ) : null}
      </View>

      <BottomSheet
        visible={identityPickerOpen}
        onDismiss={() => setIdentityPickerOpen(false)}
        snapPoints={[0.45]}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>Send from</BottomSheetTitle>
        </BottomSheetHeader>
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

function ComposeFormatBar({
  theme,
  styles,
  draftSaveStatus,
  hasSignature,
  onBold,
  onItalic,
  onUnderline,
  onList,
  onInsertSignature,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  draftSaveStatus: DraftSaveStatus;
  hasSignature: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onList: () => void;
  onInsertSignature: () => void;
}) {
  return (
    <View style={styles.formatBar}>
      <View style={styles.formatToolbar}>
        <Pressable
          onPressIn={onBold}
          accessibilityRole="button"
          accessibilityLabel="Bold"
          style={styles.formatButton}
        >
          <Text style={styles.formatButtonText}>B</Text>
        </Pressable>
        <Pressable
          onPressIn={onItalic}
          accessibilityRole="button"
          accessibilityLabel="Italic"
          style={styles.formatButton}
        >
          <Text style={[styles.formatButtonText, styles.formatItalic]}>I</Text>
        </Pressable>
        <Pressable
          onPressIn={onUnderline}
          accessibilityRole="button"
          accessibilityLabel="Underline"
          style={styles.formatButton}
        >
          <Text style={[styles.formatButtonText, styles.formatUnderline]}>
            U
          </Text>
        </Pressable>
        <Pressable
          onPressIn={onList}
          accessibilityRole="button"
          accessibilityLabel="List"
          style={styles.formatButton}
        >
          <Feather name="list" size={16} color={theme.colors.mutedForeground} />
        </Pressable>
        {hasSignature ? (
          <Pressable
            onPress={onInsertSignature}
            accessibilityRole="button"
            accessibilityLabel="Insert signature"
            style={styles.formatButton}
          >
            <Text style={styles.formatSigText}>Sig</Text>
          </Pressable>
        ) : null}
      </View>
      {draftSaveStatus === "saving" ? (
        <Text style={styles.draftStatus}>Saving…</Text>
      ) : draftSaveStatus === "saved" ? (
        <Text style={styles.draftStatus}>Saved</Text>
      ) : draftSaveStatus === "error" ? (
        <Text style={styles.draftStatusError}>Save failed</Text>
      ) : null}
    </View>
  );
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

function createStyles(theme: ThemeTokens) {
  const view = {
    flex: {
      flex: 1,
      minHeight: 0,
    },
    composeShell: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden" as const,
    },
    headerTrailing: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    sendPending: {
      width: LAYOUT_METRICS.sideSlot,
      height: LAYOUT_METRICS.sideSlot,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    headerFields: {
      flexShrink: 0,
    },
    fromRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      minHeight: LAYOUT_METRICS.hitSize,
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    ccToggleHit: {
      width: LAYOUT_METRICS.hitSize,
      height: LAYOUT_METRICS.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      flexShrink: 0,
    },
    formatBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      flexShrink: 0,
      minHeight: LAYOUT_METRICS.hitSize,
      paddingHorizontal: theme.spacing["2"],
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    formatToolbar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    formatButton: {
      minWidth: LAYOUT_METRICS.hitSize,
      height: LAYOUT_METRICS.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    attachmentList: {
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    attachmentChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minHeight: 36,
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
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
    bodyLoading: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    formatButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.bold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    formatItalic: {
      fontStyle: "italic" as const,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    formatUnderline: {
      textDecorationLine: "underline" as const,
    },
    formatSigText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    attachmentName: {
      flex: 1,
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.foreground,
    },
    fromLabel: {
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.mutedForeground,
    },
    fromValue: {
      flex: 1,
      minWidth: 0,
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    subjectInput: {
      minHeight: LAYOUT_METRICS.hitSize,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    draftStatus: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      paddingRight: theme.spacing["2"],
    },
    draftStatusError: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.destructive,
      paddingRight: theme.spacing["2"],
    },
    identityLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    noticeText: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
