import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  BottomSheet,
  BottomSheetHeader,
  type BottomSheetHandle,
} from "../BottomSheet";
import { LAYOUT_METRICS } from "../../lib/app-layout";
import type { ComposeRequest } from "../../lib/mail/compose-request";
import {
  canSendCompose,
  composeTextToPlain,
  formatDateTimeLabel,
  getErrorMessage,
  hasComposeUserContent,
  resolveReplyRecipients,
  validateComposeRecipients,
  resolveComposeSendBodies,
  messageBodiesToComposeText,
  type ComposeTextFields,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import {
  resolveComposeContext,
  useMailAccount,
  useMailMessage,
  useMailMutations,
  useMailRuntime,
  useSendMessage,
} from "../../lib/mail/use-mail";
import {
  formatReplyAllRecipientFields,
  validateComposeInput,
} from "../../lib/mail/mail-helpers";
import {
  createPendingComposeAttachment,
  toJmapAttachmentInput,
  type PendingComposeAttachment,
} from "../../lib/mail/compose-attachments";
import { decodeBase64ToBytes } from "../../lib/mail/binary-utils";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveInlinePgpArmoredCiphertext,
} from "../../lib/mail/message-security";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
} from "../../lib/mail/mail-crypto";
import { resolveOutgoingMessageBody } from "../../lib/mail/outgoing-message-crypto";
import {
  appendPlainTextSignature,
  getPlainTextSignature,
} from "../../lib/mail/signature-utils";
import {
  hasDraftContent,
  useComposeDraftAutosave,
  type DraftSaveStatus,
} from "../../hooks/use-compose-draft-autosave";
import type {
  JmapEmailMessage,
  JmapIdentity,
  MailAddress,
} from "../../lib/mail/types";
import { ComposeRecipientField } from "./ComposeRecipientField";
import {
  ComposeBodyEditor,
  type ComposeBodyEditorHandle,
} from "./ComposeBodyEditor";
import { useRecentContacts } from "../../hooks/use-recent-contacts";
import { extractRecentContactEntries } from "../../lib/record-recent-contacts";
import { collectCommittedEmails } from "../../lib/mail/compose-recipients";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import { useUserTimeFormat } from "../../hooks/use-user-time-format";
import { useUserTimezone } from "../../hooks/use-user-timezone";
import { ComposeHeader } from "./ComposeHeader";
import { ComposeFormatBar } from "./ComposeFormatBar";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeIdentitySheet } from "./ComposeIdentitySheet";
import { useMailSkin, type MailSkin } from "./mail-ui";
import { composeTitle } from "../../lib/mail/compose-display";

interface QuotedDateOptions {
  timeFormat: TimeFormat;
  timezone: string;
}

interface ComposeSheetProps {
  visible: boolean;
  /** Null once the sheet has finished closing; each open passes a fresh request. */
  request: ComposeRequest | null;
  presentKey: number;
  onClose: () => void;
  onCloseComplete: () => void;
}

/** Compose drawer: new messages, replies, forwards, and drafts. */
export function ComposeSheet({
  visible,
  request,
  presentKey,
  onClose,
  onCloseComplete,
}: ComposeSheetProps) {
  if (!request) {
    return null;
  }
  return (
    <ComposeSession
      key={presentKey}
      visible={visible}
      params={request}
      presentKey={presentKey}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
    />
  );
}

function ComposeSession({
  visible,
  params,
  presentKey,
  onClose,
  onCloseComplete,
}: Omit<ComposeSheetProps, "request"> & { params: ComposeRequest }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const { toast } = useToast();
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const sendMessage = useSendMessage(runtime);
  const { moveToTrash } = useMailMutations(runtime, null);
  const { recordUsage } = useRecentContacts();
  const sourceMessage =
    useMailMessage(runtime, params.messageId ?? "").data ?? null;

  const [to, setTo] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seedFields, setSeedFields] = useState<ComposeTextFields | null>(null);
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
  const subjectInputRef = useRef<TextInput>(null);
  const focusSubject = useCallback(() => subjectInputRef.current?.focus(), []);
  const bodyEditorRef = useRef<ComposeBodyEditorHandle>(null);

  const composeContext = resolveComposeContext(
    runtime,
    selectedIdentityId ?? undefined,
  );
  const identities = runtime?.pickerIdentities ?? NO_IDENTITIES;

  useEffect(() => {
    if (!selectedIdentityId && identities[0]?.id) {
      setSelectedIdentityId(identities[0].id);
    }
  }, [identities, selectedIdentityId]);

  const hasUserContent = hasComposeUserContent(
    { to, cc, bcc, subject, body },
    seedFields ?? EMPTY_COMPOSE_FIELDS,
  );

  const { saveDraft } = useComposeDraftAutosave({
    runtime,
    enabled: Boolean(composeContext) && hasUserContent,
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

      const savedDraft = await saveDraft();

      sendMessage.mutate(
        {
          to: validation.to,
          cc: validation.cc,
          bcc: validation.bcc,
          subject: subject.trim(),
          textBody,
          htmlBody,
          identityId: selectedIdentityId,
          previousDraftId:
            savedDraft.status === "saved" ? savedDraft.draftId : draftId,
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
            onClose();
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
    onClose,
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

  const isDirty = hasUserContent || attachments.length > 0;

  // A swipe-close saves after the sheet is gone; its late close must not hit a compose opened meanwhile.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const leaveCompose = useCallback(() => {
    if (mountedRef.current) onClose();
  }, [onClose]);

  const handleDiscard = useCallback(() => {
    if (draftId && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  }, [draftId, leaveCompose, moveToTrash, runtime]);

  const leaveClean = useCallback(() => {
    // Drop a draft autosaved earlier in this session once its content was removed again.
    if (draftId && params.mode !== "draft" && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  }, [draftId, leaveCompose, moveToTrash, params.mode, runtime]);

  const saveAndLeave = useCallback(async () => {
    const result = await saveDraft();
    if (result.status === "failed") {
      // Stay open (reopening a swiped-away sheet) so a failed save never silently drops the message.
      toast("Couldn't save draft", "error");
      sheetRef.current?.snapTo(0);
      return;
    }
    if (result.status === "empty") {
      leaveClean();
      return;
    }
    toast("Draft saved", "success");
    leaveCompose();
  }, [leaveClean, leaveCompose, saveDraft, toast]);

  const handleCancel = useCallback(() => {
    if (!isDirty) {
      leaveClean();
      return;
    }

    const saveOption = hasDraftContent({ to, cc, bcc, subject, body })
      ? [{ text: "Save Draft", onPress: () => void saveAndLeave() }]
      : [];
    Alert.alert(
      "Draft",
      attachments.length > 0 ? "Attachments aren't saved with drafts." : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Draft",
          style: "destructive",
          onPress: handleDiscard,
        },
        ...saveOption,
      ],
    );
  }, [
    attachments.length,
    bcc,
    body,
    cc,
    handleDiscard,
    isDirty,
    leaveClean,
    saveAndLeave,
    subject,
    to,
  ]);

  // Swipe-down and backdrop taps keep text as a draft; drafts don't store attachments, so those still prompt.
  const handleSheetDismiss = useCallback(() => {
    if (!isDirty) {
      leaveClean();
      return;
    }
    if (attachments.length > 0) {
      sheetRef.current?.snapTo(0);
      handleCancel();
      return;
    }
    void saveAndLeave();
  }, [attachments.length, handleCancel, isDirty, leaveClean, saveAndLeave]);

  const handleHardwareBack = useEffectEvent(() => {
    if (identityPickerOpen) {
      setIdentityPickerOpen(false);
    } else {
      handleCancel();
    }
    return true;
  });

  // Registered once per open: re-registering each render would put it above the identity picker's handler.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => handleHardwareBack(),
    );
    return () => subscription.remove();
  }, [visible]);

  const canSend =
    Boolean(composeContext) &&
    !sendMessage.isPending &&
    !isDraftDecrypting &&
    canSendCompose({
      to,
      cc,
      bcc,
      subject,
      bodyText: composeTextToPlain(body),
      attachmentCount: attachments.length,
    });

  useEffect(() => {
    if (seedFields) {
      return;
    }

    // The seeded fields are the baseline: closing without edits never saves or prompts.
    const seedCompose = (fields: ComposeTextFields) => {
      setTo(fields.to);
      setCc(fields.cc);
      setBcc(fields.bcc);
      setSubject(fields.subject);
      setBody(fields.body);
      if (fields.cc || fields.bcc) {
        setShowCcBcc(true);
      }
      setSeedFields(fields);
    };

    const toParam = params.to;
    if (toParam) {
      const trimmedName = params.toName?.trim();
      seedCompose({
        ...EMPTY_COMPOSE_FIELDS,
        to:
          trimmedName && trimmedName.toLowerCase() !== toParam.toLowerCase()
            ? `${trimmedName} <${toParam}>`
            : toParam,
      });
      return;
    }

    if (!sourceMessage) {
      return;
    }

    const fromEmail =
      composeContext?.fromEmail ?? runtime?.session.username ?? null;
    const dateOptions = { timeFormat, timezone };
    if (params.mode === "reply") {
      seedCompose({
        ...EMPTY_COMPOSE_FIELDS,
        to: getReplyRecipients(sourceMessage, fromEmail),
        subject: prefixSubject(sourceMessage.subject, "Re:"),
        body: buildReplyBody(sourceMessage, dateOptions),
      });
    } else if (params.mode === "reply-all") {
      const fields = formatReplyAllRecipientFields(sourceMessage, fromEmail);
      seedCompose({
        ...EMPTY_COMPOSE_FIELDS,
        to: fields.to,
        cc: fields.cc,
        subject: prefixSubject(sourceMessage.subject, "Re:"),
        body: buildReplyBody(sourceMessage, dateOptions),
      });
    } else if (params.mode === "forward") {
      seedCompose({
        ...EMPTY_COMPOSE_FIELDS,
        subject: prefixSubject(sourceMessage.subject, "Fwd:"),
        body: buildForwardBody(sourceMessage, dateOptions),
      });
    } else if (params.mode === "draft") {
      const headers = {
        to: formatAddressList(sourceMessage.to),
        cc: formatAddressList(sourceMessage.cc),
        bcc: formatAddressList(sourceMessage.bcc),
        subject: sourceMessage.subject ?? "",
      };
      setDraftId(sourceMessage.id);

      const encryption = classifyMessageEncryption(sourceMessage);
      if (encryption === "inline_pgp" || encryption === "pgp_mime") {
        if (!runtime) {
          return;
        }

        let cancelled = false;
        setIsDraftDecrypting(true);
        void (async () => {
          let plaintext = "";
          try {
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
          } catch (err) {
            if (!cancelled) {
              setError(getErrorMessage(err, "Could not decrypt this draft."));
            }
          } finally {
            if (!cancelled) {
              setIsDraftDecrypting(false);
              seedCompose({ ...headers, body: plaintext });
            }
          }
        })();

        return () => {
          cancelled = true;
        };
      }

      seedCompose({
        ...headers,
        body: messageBodiesToComposeText(extractMessageBodies(sourceMessage)),
      });
    } else {
      setSeedFields(EMPTY_COMPOSE_FIELDS);
    }
  }, [
    composeContext?.fromEmail,
    params.mode,
    params.to,
    params.toName,
    runtime,
    seedFields,
    sourceMessage,
    timeFormat,
    timezone,
  ]);

  const hasSignature = Boolean(getPlainTextSignature(selectedIdentity));
  const toExcludeEmails = useMemo(
    () => collectCommittedEmails(cc, bcc),
    [bcc, cc],
  );
  const ccExcludeEmails = useMemo(
    () => collectCommittedEmails(to, bcc),
    [bcc, to],
  );
  const bccExcludeEmails = useMemo(
    () => collectCommittedEmails(to, cc),
    [cc, to],
  );
  const canChooseIdentity = Boolean(composeContext) && identities.length > 1;

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        visible={visible}
        presentKey={presentKey}
        onDismiss={handleSheetDismiss}
        onCloseComplete={onCloseComplete}
        keyboardBehavior="extend"
        enableContentPanningGesture={false}
      >
        <BottomSheetHeader showClose={false} style={styles.sheetHeader}>
          <ComposeHeader
            title={composeTitle(subject)}
            canSend={canSend}
            sending={sendMessage.isPending}
            onClose={handleCancel}
            onAttach={() => {
              void handleAttach();
            }}
            onSend={() => {
              void handleSend();
            }}
          />
        </BottomSheetHeader>
        <View
          style={[
            styles.composeShell,
            { paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom },
          ]}
        >
          <View style={styles.flex}>
            <View style={styles.headerFields}>
              {runtimeQuery.isLoading && !composeContext ? (
                <View style={styles.fieldRow}>
                  <ActivityIndicator size="small" color={skin.textTertiary} />
                  <Text style={styles.noticeInline}>
                    Preparing your mailbox…
                  </Text>
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
                label="To"
                excludeEmails={toExcludeEmails}
                onSubmitEmpty={focusSubject}
                trailing={
                  <Pressable
                    onPress={() => setShowCcBcc((prev) => !prev)}
                    style={({ pressed }) => [
                      styles.ccToggleHit,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showCcBcc
                        ? "Hide Cc, Bcc, and From"
                        : "Show Cc, Bcc, and From"
                    }
                  >
                    <Feather
                      name={showCcBcc ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={skin.textTertiary}
                    />
                  </Pressable>
                }
              />

              {showCcBcc ? (
                <>
                  <ComposeRecipientField
                    value={cc}
                    onChangeText={setCc}
                    label="Cc"
                    excludeEmails={ccExcludeEmails}
                    onSubmitEmpty={focusSubject}
                  />
                  <ComposeRecipientField
                    value={bcc}
                    onChangeText={setBcc}
                    label="Bcc"
                    excludeEmails={bccExcludeEmails}
                    onSubmitEmpty={focusSubject}
                  />
                  {composeContext ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.fieldRow,
                        pressed && canChooseIdentity && styles.pressed,
                      ]}
                      onPress={
                        canChooseIdentity
                          ? () => setIdentityPickerOpen(true)
                          : undefined
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Choose sending identity"
                    >
                      <Text style={styles.fieldLabel}>From</Text>
                      <Text style={styles.fieldValue} numberOfLines={1}>
                        {composeContext.fromName
                          ? `${composeContext.fromName}`
                          : composeContext.fromEmail}
                      </Text>
                      {canChooseIdentity ? (
                        <Feather
                          name="chevron-down"
                          size={16}
                          color={skin.textTertiary}
                        />
                      ) : null}
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  ref={subjectInputRef}
                  style={styles.subjectInput}
                  value={subject}
                  onChangeText={setSubject}
                  onFocus={() => setBodyFocused(false)}
                  placeholderTextColor={skin.textTertiary}
                  selectionColor={theme.colors.primaryBase}
                  cursorColor={theme.colors.primaryBase}
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus={false}
                  accessibilityLabel="Subject"
                />
              </View>

              {attachments.length > 0 ? (
                <ComposeAttachmentList
                  attachments={attachments}
                  onRemove={(id) =>
                    setAttachments((current) =>
                      current.filter((item) => item.id !== id),
                    )
                  }
                />
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {isDraftDecrypting ? (
              <View style={styles.bodyLoading}>
                <ActivityIndicator size="small" color={skin.textTertiary} />
                <Text style={styles.noticeInline}>Decrypting draft…</Text>
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

          {bodyFocused ? (
            <ComposeFormatBar
              draftSaveStatus={draftSaveStatus}
              hasSignature={hasSignature}
              onBold={() => bodyEditorRef.current?.applyBold()}
              onItalic={() => bodyEditorRef.current?.applyItalic()}
              onUnderline={() => bodyEditorRef.current?.applyUnderline()}
              onList={() => bodyEditorRef.current?.applyList()}
              onInsertSignature={handleInsertSignature}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ComposeIdentitySheet
        visible={identityPickerOpen}
        identities={identities}
        selectedIdentityId={selectedIdentityId}
        onSelect={(id) => {
          setSelectedIdentityId(id);
          setIdentityPickerOpen(false);
        }}
        onDismiss={() => setIdentityPickerOpen(false)}
      />
    </>
  );
}

const NO_IDENTITIES: JmapIdentity[] = [];

const EMPTY_COMPOSE_FIELDS: ComposeTextFields = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

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

function formatQuotedDate(
  receivedAt: string | undefined,
  { timeFormat, timezone }: QuotedDateOptions,
): string {
  return receivedAt
    ? formatDateTimeLabel(new Date(receivedAt), timezone, timeFormat)
    : "Unknown date";
}

function buildReplyBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
): string {
  const sender =
    message.from?.[0]?.name?.trim() ||
    message.from?.[0]?.email?.trim() ||
    "Unknown sender";
  const receivedAt = formatQuotedDate(message.receivedAt, dateOptions);
  const bodies = extractMessageBodies(message);
  const source = bodies.text?.trim() || stripHtmlToText(bodies.html);
  const quoted = source
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");

  return `\n\nOn ${receivedAt}, ${sender} wrote:\n${quoted}`;
}

function buildForwardBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
): string {
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
  const date = formatQuotedDate(message.receivedAt, dateOptions);

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

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    flex: {
      flex: 1,
      minHeight: 0,
    },
    composeShell: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden" as const,
      backgroundColor: theme.colors.card,
    },
    sheetHeader: {
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderBottomWidth: 0,
    },
    headerFields: {
      flexShrink: 0,
    },
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: LAYOUT_METRICS.hitSize + theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderTertiary,
    },
    ccToggleHit: {
      width: LAYOUT_METRICS.hitSize,
      height: LAYOUT_METRICS.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      flexShrink: 0,
    },
    pressed: {
      backgroundColor: skin.pressed,
    },
    bodyLoading: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    fieldLabel: {
      ...skin.body,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.textTertiary,
    },
    fieldValue: {
      flex: 1,
      minWidth: 0,
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    subjectInput: {
      flex: 1,
      minWidth: 0,
      minHeight: LAYOUT_METRICS.hitSize,
      paddingVertical: theme.spacing["2"],
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    noticeInline: {
      ...skin.meta,
    },
    noticeText: {
      ...skin.meta,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
    },
    errorText: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      fontSize: 13,
      lineHeight: 17,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
