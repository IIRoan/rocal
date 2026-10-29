import {
  useEffect,
  useEffectEvent,
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
} from "@workspace/native-core/components/BottomSheet";
import { LAYOUT_METRICS } from "@workspace/native-core/lib/app-layout";
import type { ComposeRequest } from "../../lib/mail/compose-request";
import {
  appendPlainTextSignature,
  canSendCompose,
  composeTextToPlain,
  getErrorMessage,
  getPlainTextSignature,
  getSimpleLoginComposeNotice,
  hasComposeUserContent,
  hasPlainTextSignatureBlock,
  replacePlainTextSignatureBlock,
  resolveMessageReplyFrom,
  shouldWarnAboutMissingAttachment,
  validateComposeRecipients,
  resolveComposeSendBodies,
  runTasksWithConcurrencyLimit,
  type ComposeTextFields,
  type SimpleLoginComposeNotice,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  resolveComposeContext,
  useMailAccount,
  useMailMessage,
  useMailMutations,
  useMailRuntime,
  useSendMessage,
} from "../../lib/mail/use-mail";
import { validateComposeInput } from "../../lib/mail/mail-helpers";
import {
  createPendingComposeAttachment,
  toJmapAttachmentInput,
  type PendingComposeAttachment,
} from "../../lib/mail/compose-attachments";
import { decodeBase64ToBytes } from "../../lib/mail/binary-utils";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { resolveOutgoingMessageBody } from "../../lib/mail/outgoing-message-crypto";
import { useMailComposeSettings } from "../../hooks/use-mail-settings";
import {
  hasDraftContent,
  useComposeDraftAutosave,
  type DraftSaveStatus,
} from "../../hooks/use-compose-draft-autosave";
import type { JmapIdentity } from "../../lib/mail/types";
import { decryptDraftFields, planComposeSeed } from "../../lib/mail/compose-seed";
import { ComposeRecipientField } from "./ComposeRecipientField";
import {
  ComposeBodyEditor,
  type ComposeBodyEditorHandle,
} from "./ComposeBodyEditor";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { extractRecentContactEntries } from "@workspace/native-core/lib/record-recent-contacts";
import { collectCommittedEmails } from "../../lib/mail/compose-recipients";
import { useKeyboardInset } from "@workspace/native-core/hooks/use-keyboard-inset";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { ComposeHeader } from "./ComposeHeader";
import { ComposeFormatBar } from "./ComposeFormatBar";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeIdentitySheet } from "./ComposeIdentitySheet";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { composeTitle } from "../../lib/mail/compose-display";

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
  const styles = createStyles(theme, skin);
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
  const [pickedIdentityId, setPickedIdentityId] = useState<string | null>(null);
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
  const focusSubject = () => subjectInputRef.current?.focus();
  const bodyEditorRef = useRef<ComposeBodyEditorHandle>(null);

  const { settings: composeSettings, isLoaded: composeSettingsLoaded } =
    useMailComposeSettings();
  const identities = runtime?.pickerIdentities ?? NO_IDENTITIES;
  const replyFromIdentityId =
    composeSettings.autoSelectReplyIdentity &&
    sourceMessage &&
    (params.mode === "reply" ||
      params.mode === "reply-all" ||
      params.mode === "forward")
      ? resolveMessageReplyFrom(identities, sourceMessage)?.identityId
      : undefined;
  const autoReplyIdentityId =
    identities.find((entry) => entry.id === replyFromIdentityId)?.id ?? null;
  // An explicit pick wins, then the identity a reply was addressed to, then the first identity.
  const selectedIdentityId =
    pickedIdentityId ?? autoReplyIdentityId ?? identities[0]?.id ?? null;
  const composeContext = resolveComposeContext(
    runtime,
    selectedIdentityId ?? undefined,
  );

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

  const selectedIdentity = identities.find((entry) => entry.id === selectedIdentityId) ??
  identities[0] ??
  null;

  const signatureOptions = { separator: composeSettings.signatureSeparatorEnabled };

  const sendNow = async () => {
    const validation = validateComposeInput({ to, cc, bcc, subject });

    // A signature seeded above the quote already sits mid-body, so only append when it is missing.
    const bodyWithSignature = hasPlainTextSignatureBlock(body, selectedIdentity)
      ? body
      : appendPlainTextSignature(body, selectedIdentity, signatureOptions);
    const { plaintext, htmlBody: formattedHtml } = resolveComposeSendBodies({
      body,
      bodyWithSignature,
      encrypted: false,
    });
    const unencryptedHtml = composeSettings.plainTextMode ? undefined : formattedHtml;
    const allRecipients = [
      ...validation.to,
      ...validation.cc,
      ...validation.bcc,
    ];

    const send = async () => {
      if (!runtime) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }
      const { textBody, encrypted, pgpMimeCiphertext, sentCopyCiphertext } =
        await resolveOutgoingMessageBody({
          runtime,
          recipients: allRecipients,
          plaintext,
          html: unencryptedHtml,
          mimeAttachments: attachments.map((pending) => ({
            filename: pending.name,
            contentType: pending.type,
            content: pending.bytes,
          })),
        });
      const htmlBody = encrypted ? undefined : unencryptedHtml;

      // Encrypted mail carries its attachments inside the ciphertext, so only plaintext sends upload them.
      const uploadedAttachments = encrypted
        ? []
        : await runTasksWithConcurrencyLimit(
            attachments.map((pending) => async () => {
              const uploaded = await runtime.client.uploadBlob(
                runtime.session,
                pending.bytes,
                pending.type,
              );
              return toJmapAttachmentInput(pending, uploaded.blobId);
            }),
            runtime.mailServerPolicy.maxConcurrentUploads,
          );

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
          pgpMimeCiphertext,
          sentCopyCiphertext,
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
    };
    await send().catch((err: unknown) => {
      setError(getErrorMessage(err, "Failed to send message"));
    });
  };

  const handleSend = () => {
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

    const missingAttachmentKeyword = shouldWarnAboutMissingAttachment({
      enabled: composeSettings.attachmentReminderEnabled,
      attachmentCount: attachments.length,
      subject,
      bodyText: composeTextToPlain(body),
      keywords: composeSettings.attachmentReminderKeywords,
    });
    if (missingAttachmentKeyword) {
      Alert.alert(
        "Forgot an attachment?",
        `Your message mentions “${missingAttachmentKeyword}” but no files are attached.`,
        [
          { text: "Go back", style: "cancel" },
          { text: "Send anyway", onPress: () => void sendNow() },
        ],
      );
      return;
    }
    void sendNow();
  };

  const handleInsertSignature = () => {
    if (!getPlainTextSignature(selectedIdentity)) return;
    setBody((current) =>
      hasPlainTextSignatureBlock(current, selectedIdentity)
        ? current
        : appendPlainTextSignature(current, selectedIdentity, signatureOptions),
    );
  };

  const handleSelectIdentity = (id: string) => {
    const nextIdentity = identities.find((entry) => entry.id === id) ?? null;
    setBody(
      (current) =>
        replacePlainTextSignatureBlock(
          current,
          selectedIdentity,
          nextIdentity,
          signatureOptions,
        ) ?? current,
    );
    setPickedIdentityId(id);
    setIdentityPickerOpen(false);
  };

  const handleAttach = async () => {
    const pickAttachments = async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      // The picker's cache copy is plaintext, so it is deleted once read.
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }).finally(() =>
        FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined),
      );
      const bytes = decodeBase64ToBytes(base64);
      setAttachments((current) => [
        ...current,
        createPendingComposeAttachment({
          name: asset.name ?? "attachment",
          type: asset.mimeType,
          bytes,
        }),
      ]);
    };
    await pickAttachments().catch((err: unknown) => {
      setError(getErrorMessage(err, "Failed to attach file."));
    });
  };

  const isDirty = hasUserContent || attachments.length > 0;

  // A swipe-close saves after the sheet is gone; its late close must not hit a compose opened meanwhile.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const leaveCompose = () => {
    if (mountedRef.current) onClose();
  };

  const handleDiscard = () => {
    if (draftId && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  };

  const leaveClean = () => {
    // Drop a draft autosaved earlier in this session once its content was removed again.
    if (draftId && params.mode !== "draft" && runtime) {
      moveToTrash.mutate(draftId);
    }
    leaveCompose();
  };

  const saveAndLeave = async () => {
    const leaveWithDraft = async () => {
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
    };
    await leaveWithDraft().catch(() => {
      // saveDraft reports its own failures; this only guards the leave path.
      toast("Couldn't save draft", "error");
      sheetRef.current?.snapTo(0);
    });
  };

  const handleCancel = () => {
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
  };

  // Swipe-down and backdrop taps keep text as a draft; drafts don't store attachments, so those still prompt.
  const handleSheetDismiss = () => {
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
  };

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

  // Seeded during render once the source message and settings are in, so the form never paints empty first.
  const seedPlan =
    seedFields || isDraftDecrypting
      ? null
      : planComposeSeed({
          params,
          sourceMessage,
          settingsLoaded: composeSettingsLoaded,
          signaturePosition: composeSettings.signaturePosition,
          signatureOptions,
          identity: selectedIdentity,
          identities,
          fromEmail:
            (autoReplyIdentityId ? selectedIdentity?.email : null) ??
            composeContext?.fromEmail ??
            runtime?.session.username ??
            null,
          dateOptions: { timeFormat, timezone },
          runtime,
        });
  if (seedPlan?.draftId) setDraftId(seedPlan.draftId);
  if (seedPlan?.kind === "fields") seedCompose(seedPlan.fields);
  if (seedPlan?.kind === "decrypt-draft") setIsDraftDecrypting(true);

  const finishDraftDecrypt = useEffectEvent(
    (fields: ComposeTextFields, decryptError: string | null) => {
      setIsDraftDecrypting(false);
      // An editor without the body would autosave over the encrypted draft, so it closes and leaves it intact.
      if (decryptError) {
        toast(decryptError, "error");
        onClose();
        return;
      }
      seedCompose(fields);
    },
  );

  useEffect(() => {
    if (!isDraftDecrypting || !runtime || !sourceMessage) return;
    let cancelled = false;
    void decryptDraftFields(runtime, sourceMessage)
      .then(({ fields, error: decryptError }) => {
        if (!cancelled) finishDraftDecrypt(fields, decryptError);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isDraftDecrypting, runtime, sourceMessage]);

  const hasSignature = Boolean(getPlainTextSignature(selectedIdentity));
  const toExcludeEmails = collectCommittedEmails(cc, bcc);
  const ccExcludeEmails = collectCommittedEmails(to, bcc);
  const bccExcludeEmails = collectCommittedEmails(to, cc);
  const canChooseIdentity = Boolean(composeContext) && identities.length > 1;
  const parsedRecipients = validateComposeInput({ to, cc, bcc, subject });
  const simpleLoginNotice =
    sourceMessage && (params.mode === "reply" || params.mode === "reply-all")
      ? getSimpleLoginComposeNotice({
          message: sourceMessage,
          identities,
          fromEmail: composeContext?.fromEmail,
          recipients: [
            ...parsedRecipients.to,
            ...parsedRecipients.cc,
            ...parsedRecipients.bcc,
          ],
        })
      : NO_SIMPLELOGIN_NOTICE;

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
            onSend={handleSend}
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

              {simpleLoginNotice.via ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Via</Text>
                  <Feather name="shuffle" size={14} color={skin.textTertiary} />
                  <View style={styles.fieldValueStack}>
                    <Text style={styles.viaAlias} numberOfLines={1} ellipsizeMode="middle">
                      {simpleLoginNotice.via.alias}
                    </Text>
                    <Text style={styles.noticeInline} numberOfLines={2}>
                      {simpleLoginNotice.via.detail}
                    </Text>
                  </View>
                </View>
              ) : null}

              {simpleLoginNotice.requiredFrom ? (
                <Pressable
                  style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}
                  onPress={() => {
                    if (simpleLoginNotice.requiredFrom) {
                      handleSelectIdentity(simpleLoginNotice.requiredFrom.identityId);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${simpleLoginNotice.requiredFrom.detail} Switch From.`}
                >
                  <Feather name="alert-circle" size={14} color={theme.colors.destructive} />
                  <Text style={styles.requiredFromText}>
                    {simpleLoginNotice.requiredFrom.detail}
                  </Text>
                  <Text style={styles.requiredFromAction}>Switch From</Text>
                </Pressable>
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
              plainTextMode={composeSettings.plainTextMode}
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
        onSelect={handleSelectIdentity}
        onDismiss={() => setIdentityPickerOpen(false)}
      />
    </>
  );
}

const NO_IDENTITIES: JmapIdentity[] = [];

const NO_SIMPLELOGIN_NOTICE: SimpleLoginComposeNotice = { via: null, requiredFrom: null };

const EMPTY_COMPOSE_FIELDS: ComposeTextFields = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

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
    fieldValueStack: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      paddingVertical: theme.spacing["2"],
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
    viaAlias: {
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    requiredFromText: {
      ...skin.meta,
      flex: 1,
      minWidth: 0,
      paddingVertical: theme.spacing["2"],
      color: theme.colors.destructive,
    },
    requiredFromAction: {
      ...skin.meta,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
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
