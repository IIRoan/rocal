import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheet,
  BottomSheetHeader,
  type BottomSheetHandle,
} from "@workspace/native-core/components/BottomSheet";
import { LAYOUT_METRICS } from "@workspace/native-core/lib/app-layout";
import type { ComposeRequest } from "../../lib/mail/compose-request";
import type { JmapIdentity } from "../../lib/mail/types";
import {
  createMailSendSessionId,
  createMailSendScopeLifetime,
  discardMailSendAttempt,
  isMailSendScopeOpen,
  composeSignatureCandidates,
  composeSignatureKind,
  getErrorMessage,
  getOutgoingAttachmentSizeError,
  getPlainTextSignature,
  hasComposeUserContent,
  insertPlainTextSignature,
  listComposeSignatureOptions,
  replaceComposePlainTextSignature,
  resolveComposeSignature,
  resolveMailTemplateSubject,
  type ComposeTextFields,
  type MailComposeSettings,
  type MailTemplate,
  type SignatureSource,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  useMailAccount,
  useMailMessage,
  useMailRuntime,
} from "../../lib/mail/use-mail";
import {
  createPendingComposeAttachment,
  type PendingComposeAttachment,
} from "../../lib/mail/compose-attachments";
import { decodeBase64ToBytes } from "../../lib/mail/binary-utils";
import {
  stripPickedImageMetadata,
  type StrippedImageFile,
} from "../../lib/mail/strip-image-metadata";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useMailComposeSettings } from "../../hooks/use-mail-settings";
import {
  useComposeDraftAutosave,
  type DraftSaveStatus,
} from "../../hooks/use-compose-draft-autosave";
import { useComposeForm } from "../../hooks/use-compose-form";
import { useComposeIdentity } from "../../hooks/use-compose-identity";
import { useComposeLeave } from "../../hooks/use-compose-leave";
import { useComposeSend } from "../../hooks/use-compose-send";
import { useComposeSchedule } from "../../hooks/use-compose-schedule";
import { ComposeRecipientFields } from "./ComposeRecipientFields";
import {
  ComposeBodyEditor,
  type ComposeBodyEditorHandle,
} from "./ComposeBodyEditor";
import { useKeyboardInset } from "@workspace/native-core/hooks/use-keyboard-inset";
import { ComposeHeader } from "./ComposeHeader";
import { ComposeFormatBar } from "./ComposeFormatBar";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeIdentitySheet } from "./ComposeIdentitySheet";
import { ComposeScheduleSheet } from "./ComposeScheduleSheet";
import { ComposeTemplatesSheet } from "./ComposeTemplatesSheet";
import { ComposeSignatureSheet } from "./ComposeSignatureSheet";
import {
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import { composeTitle } from "../../lib/mail/compose-display";

interface ComposeSheetProps {
  visible: boolean;
  /** Null once the sheet has finished closing; each open passes a fresh request. */
  request: ComposeRequest | null;
  presentKey: number;
  onClose: () => void;
  onCloseComplete: () => void;
  onRestore: (request: ComposeRequest) => void;
}

/** Compose drawer: new messages, replies, forwards, and drafts. */
export function ComposeSheet({
  visible,
  request,
  presentKey,
  onClose,
  onCloseComplete,
  onRestore,
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
      onRestore={onRestore}
    />
  );
}

function ComposeSession({
  visible,
  params,
  presentKey,
  onClose,
  onCloseComplete,
  onRestore,
}: Omit<ComposeSheetProps, "request"> & { params: ComposeRequest }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);

  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;
  const sourceMessage =
    useMailMessage(runtime, params.messageId ?? "").data ?? null;

  const [error, setError] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<DraftSaveStatus>("idle");
  const [bodyFocused, setBodyFocused] = useState(false);
  const schedule = useComposeSchedule();
  const subjectInputRef = useRef<TextInputInstance>(null);
  const focusSubject = () => subjectInputRef.current?.focus();
  const bodyEditorRef = useRef<ComposeBodyEditorHandle>(null);

  const { settings: composeSettings, isLoaded: composeSettingsLoaded } =
    useMailComposeSettings();
  const identity = useComposeIdentity({
    runtime,
    sourceMessage,
    mode: params.mode,
    autoSelectReplyIdentity: composeSettings.autoSelectReplyIdentity,
  });
  const { identities, selectedIdentity, selectedIdentityId, composeContext } =
    identity;
  const signatureOptions = {
    separator: composeSettings.signatureSeparatorEnabled,
  };
  const signatureChoice = useComposeSignatureChoice(composeSettings, identities, selectedIdentityId, params.mode);

  const [form, dispatch] = useComposeForm({
    params,
    sourceMessage,
    settingsLoaded: composeSettingsLoaded,
    replySignaturePosition: composeSettings.replySignaturePosition,
    signatureOptions,
    signature: signatureChoice.signature,
    identities,
    fromEmail:
      (identity.autoReplyIdentityId ? selectedIdentity?.email : null) ??
      composeContext?.fromEmail ??
      runtime?.session.username ??
      null,
    runtime,
    onClose,
  });
  const { to, cc, bcc, subject, body, attachments } = form;

  const hasUserContent = hasComposeUserContent(
    { to, cc, bcc, subject, body },
    form.seed ?? EMPTY_COMPOSE_FIELDS,
  );

  const { saveDraft, settleDraftSave } = useComposeDraftAutosave({
    runtime,
    enabled: Boolean(composeContext) && hasUserContent,
    to,
    cc,
    bcc,
    subject,
    body,
    identityId: selectedIdentityId,
    draftId: form.draftId,
    setDraftId: (draftId) => dispatch({ type: "draftId", draftId }),
    setDraftSaveStatus,
  });

  const currentDraftIdRef = useRef(form.draftId);
  useEffect(() => { currentDraftIdRef.current = form.draftId; }, [form.draftId]);
  const [sendSessionId, setSendSessionId] = useState(createMailSendSessionId);
  const [sendLifetime] = useState(createMailSendScopeLifetime);
  useEffect(() => sendLifetime.activate(() => `compose:${sendSessionId}`, () => visible ? currentDraftIdRef.current ?? (params.mode === "draft" ? params.messageId ?? null : null) : null), [sendLifetime, sendSessionId, visible, params.mode, params.messageId]);
  const closeSendSession = () => {
    discardMailSendAttempt(`compose:${sendSessionId}`);
    onClose();
  };
  const { send, sending, canSend } = useComposeSend({
    sendScope: `compose:${sendSessionId}`,
    runtime,
    mode: params.mode,
    sourceMessage,
    form,
    identityId: selectedIdentityId,
    composeContext,
    settings: composeSettings,
    settleDraftSave,
    setError,
    onRestore,
    onSent: () => {
      if (!isMailSendScopeOpen(`compose:${sendSessionId}`)) return;
      closeSendSession();
      setSendSessionId(createMailSendSessionId());
    },
  });

  const { cancel, dismiss } = useComposeLeave({
    runtime,
    mode: params.mode,
    form,
    hasUserContent,
    saveDraft,
    sheetRef,
    visible,
    identityPickerOpen: identity.pickerOpen,
    closeIdentityPicker: () => identity.setPickerOpen(false),
    onClose: closeSendSession,
  });

  const signaturePicker = useComposeSignatureActions({ dispatch, identity, settings: composeSettings, signatureChoice });

  const templatePicker = useComposeTemplatePicker(dispatch, subject, bodyEditorRef);

  const handleAttach = async () => {
    await pickComposeAttachment(
      runtime?.mailServerPolicy.limits.maxOutgoingAttachmentBytes,
      composeSettings.stripImageMetadata ? setError : null,
    )
      .then((attachment) => {
        if (attachment) dispatch({ type: "attach", attachment });
      })
      .catch((err: unknown) => {
        setError(getErrorMessage(err, "Failed to attach file."));
      });
  };

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        visible={visible}
        presentKey={presentKey}
        onDismiss={dismiss}
        onCloseComplete={onCloseComplete}
        keyboardBehavior="extend"
        enableContentPanningGesture={false}
      >
        <BottomSheetHeader showClose={false} style={styles.sheetHeader}>
          <ComposeHeader
            title={composeTitle(subject)}
            canSend={canSend}
            sending={sending}
            onClose={cancel}
            onAttach={() => {
              void handleAttach();
            }}
            onSend={() => send(schedule.sendAt ?? undefined)}
            onSchedule={runtime?.mailServerPolicy.maxDelayedSendSeconds ? schedule.open : undefined}
            scheduledLabel={schedule.label}
            onClearSchedule={schedule.clear}
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

              <ComposeRecipientFields
                to={to}
                cc={cc}
                bcc={bcc}
                showCcBcc={form.showCcBcc}
                dispatch={dispatch}
                mode={params.mode}
                sourceMessage={sourceMessage}
                identities={identities}
                composeContext={composeContext}
                onChooseIdentity={() => identity.setPickerOpen(true)}
                onSelectIdentity={signaturePicker.selectIdentity}
                onSubmitEmpty={focusSubject}
              />

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  ref={subjectInputRef}
                  style={styles.subjectInput}
                  value={subject}
                  onChangeText={(value) =>
                    dispatch({ type: "edit", field: "subject", value })
                  }
                  onFocus={() => setBodyFocused(false)}
                  placeholderTextColor={skin.textTertiary}
                  selectionColor={theme.colors.primaryBase}
                  cursorColor={theme.colors.primaryBase}
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus={false}
                  accessibilityLabel="Subject"
                  testID="compose-subject"
                />
              </View>

              {attachments.length > 0 ? (
                <ComposeAttachmentList
                  attachments={attachments}
                  onRemove={(id) => dispatch({ type: "detach", id })}
                />
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {form.decrypting ? (
              <View style={styles.bodyLoading}>
                <ActivityIndicator size="small" color={skin.textTertiary} />
                <Text style={styles.noticeInline}>Decrypting draft…</Text>
              </View>
            ) : (
              <ComposeBodyEditor
                ref={bodyEditorRef}
                value={body}
                bodySourceVersion={form.bodySourceVersion}
                onChangeText={(value) =>
                  dispatch({ type: "edit", field: "body", value })
                }
                onFocusChange={setBodyFocused}
                placeholder="Message"
              />
            )}
          </View>

          {bodyFocused ? (
            <ComposeFormatBar
              draftSaveStatus={draftSaveStatus}
              plainTextMode={composeSettings.plainTextMode}
              signed={composeSettings.signOutgoingMail}
              onBold={() => bodyEditorRef.current?.applyBold()}
              onItalic={() => bodyEditorRef.current?.applyItalic()}
              onUnderline={() => bodyEditorRef.current?.applyUnderline()}
              onList={() => bodyEditorRef.current?.applyList()}
              onChooseSignature={signaturePicker.open}
              onInsertTemplate={templatePicker.open}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ComposeTemplatesSheet templates={composeSettings.templates} {...templatePicker.sheet} />

      <ComposeSignatureSheet {...signaturePicker.sheet} />

      <ComposeScheduleSheet
        key={schedule.sheet.key}
        visible={schedule.sheet.visible}
        runtime={runtime}
        recipients={{ to, cc, bcc }}
        onSchedule={schedule.sheet.onSchedule}
        onDismiss={schedule.sheet.onDismiss}
      />

      <ComposeIdentitySheet
        visible={identity.pickerOpen}
        identities={identities}
        selectedIdentityId={selectedIdentityId}
        onSelect={signaturePicker.selectIdentity}
        onDismiss={() => identity.setPickerOpen(false)}
      />
    </>
  );
}

/** The signature compose uses: the choice made in its picker, else the sender's default; null is none. */
function useComposeSignatureChoice(
  settings: MailComposeSettings,
  identities: JmapIdentity[],
  identityId: string | null,
  mode: ComposeRequest["mode"],
) {
  const kind = composeSignatureKind(mode);
  const [choice, setChoice] = useState<string | null>();
  const signature = resolveComposeSignature(settings, identities, identityId, kind, choice);
  return { kind, choice, setChoice, signature };
}

/** Signature picker and identity switch, keeping the body's signature block in step with the sender. */
function useComposeSignatureActions({
  dispatch,
  identity,
  settings,
  signatureChoice,
}: {
  dispatch: ReturnType<typeof useComposeForm>[1];
  identity: ReturnType<typeof useComposeIdentity>;
  settings: MailComposeSettings;
  signatureChoice: ReturnType<typeof useComposeSignatureChoice>;
}) {
  const { kind, choice, setChoice, signature } = signatureChoice;
  const [visible, setVisible] = useState(false);
  const { identities, selectedIdentityId } = identity;
  const options = { separator: settings.signatureSeparatorEnabled };
  const candidates = composeSignatureCandidates(settings, identities);
  const replaceIn = (next: SignatureSource | null) => (current: string) =>
    replaceComposePlainTextSignature(current, candidates, next, options) ?? current;

  const placement = {
    ...options,
    aboveQuote: kind === "replyForward" && settings.replySignaturePosition === "above_quote",
  };

  // A signature the body lacks goes where a new compose puts it.
  const onSelect = (nextChoice: string | null | undefined) => {
    setVisible(false);
    setChoice(nextChoice);
    const next = resolveComposeSignature(settings, identities, selectedIdentityId, kind, nextChoice);
    dispatch({
      type: "editBody",
      update: (current) =>
        replaceComposePlainTextSignature(current, candidates, next, options) ??
        insertPlainTextSignature(current, next, placement),
    });
  };

  const selectIdentity = (id: string) => {
    dispatch({
      type: "editBody",
      update: replaceIn(resolveComposeSignature(settings, identities, id, kind)),
    });
    setChoice(undefined);
    identity.pick(id);
  };

  return {
    selectIdentity,
    open: () => setVisible(true),
    sheet: {
      visible,
      options: listComposeSignatureOptions(settings, identities, selectedIdentityId, kind, choice),
      noneSelected: !getPlainTextSignature(signature),
      onSelect,
      onDismiss: () => setVisible(false),
    },
  };
}

/** Template picker state; a template fills an empty subject and goes in at the body's caret. */
function useComposeTemplatePicker(
  dispatch: ReturnType<typeof useComposeForm>[1],
  subject: string,
  bodyEditorRef: RefObject<ComposeBodyEditorHandle | null>,
) {
  const [visible, setVisible] = useState(false);
  const onSelect = (template: MailTemplate) => {
    setVisible(false);
    const nextSubject = resolveMailTemplateSubject(subject, template);
    if (nextSubject !== subject) {
      dispatch({ type: "edit", field: "subject", value: nextSubject });
    }
    bodyEditorRef.current?.insertText(template.body);
  };
  return {
    open: () => setVisible(true),
    sheet: { visible, onSelect, onDismiss: () => setVisible(false) },
  };
}

/** Picks one file; the picker's cache copy is plaintext, so it is deleted once read or refused; photos are re-encoded unless `reportStripNotice` is null. */
async function pickComposeAttachment(
  maxBytes: number | undefined,
  reportStripNotice: ((notice: string) => void) | null,
): Promise<PendingComposeAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) return null;
  const readAsset = async () => {
    const sizeError = getOutgoingAttachmentSizeError(
      asset.name ?? "attachment",
      asset.size ?? 0,
      maxBytes,
    );
    if (sizeError) throw new Error(sizeError);
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const file: StrippedImageFile = {
      name: asset.name ?? "attachment",
      type: asset.mimeType,
      bytes: decodeBase64ToBytes(base64),
    };
    return reportStripNotice ? stripPickedImageMetadata(asset.uri, file) : file;
  };
  const { notice, ...file } = await readAsset().finally(() =>
    FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(
      () => undefined,
    ),
  );
  if (notice) reportStripNotice?.(notice);
  // Re-encoding can grow a photo, so the limit is checked again on what is sent.
  const sizeError = getOutgoingAttachmentSizeError(file.name, file.bytes.length, maxBytes);
  if (sizeError) throw new Error(sizeError);
  return createPendingComposeAttachment(file);
}

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
