import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheet,
  BottomSheetHeader,
  type BottomSheetHandle,
} from "@workspace/native-core/components/BottomSheet";
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
  EMPTY_MAIL_EDITOR_FORMAT_STATE,
  type MailEditorFormatState,
} from "@workspace/mail-editor/protocol";
import { pickComposeAttachments, pickComposePhoto } from "../../lib/mail/compose-pickers";
import { useMailComposeSettings } from "../../hooks/use-mail-settings";
import {
  useComposeDraftAutosave,
  type DraftSaveStatus,
} from "../../hooks/use-compose-draft-autosave";
import { useComposeForm } from "../../hooks/use-compose-form";
import { hasComposeHtmlEdits } from "../../lib/mail/compose-form";
import { useComposeIdentity } from "../../hooks/use-compose-identity";
import { useComposeLeave } from "../../hooks/use-compose-leave";
import { useComposeSend } from "../../hooks/use-compose-send";
import { useComposeSchedule } from "../../hooks/use-compose-schedule";
import { useComposeQuotedImages } from "../../hooks/use-compose-quoted-images";
import { ComposeFields } from "./ComposeFields";
import {
  ComposeBodyEditor,
  RICH_COMPOSE_AVAILABLE,
  type ComposeBodyEditorHandle,
} from "./ComposeBodyEditor";
import { ComposeLinkSheet } from "./ComposeLinkSheet";
import { useComposeKeyboard } from "../../hooks/use-compose-keyboard";
import { ComposeFormatDock } from "./ComposeFormatDock";
import { ComposeHeader } from "./ComposeHeader";
import { ComposeFormatBar } from "./ComposeFormatBar";
import { ComposeIdentitySheet } from "./ComposeIdentitySheet";
import { ComposeScheduleSheet } from "./ComposeScheduleSheet";
import { ComposeTemplatesSheet } from "./ComposeTemplatesSheet";
import { ComposeSignatureSheet } from "./ComposeSignatureSheet";
import {
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import { COMPOSE_FORMAT_BAR_GAP, COMPOSE_FORMAT_BAR_HEIGHT, composeTitle, isThreadReply } from "../../lib/mail/compose-display";

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
  const keyboard = useComposeKeyboard();
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
  const bodyEditorRef = useRef<ComposeBodyEditorHandle>(null);

  const { settings: composeSettings, isLoaded: composeSettingsLoaded } =
    useMailComposeSettings();
  const richBody = !composeSettings.plainTextMode && RICH_COMPOSE_AVAILABLE;
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
    plainTextMode: !richBody,
    onClose,
  });
  const { to, cc, bcc, subject, body, attachments } = form;
  const htmlBody = richBody ? form.htmlBody : "";
  const quotedImages = useComposeQuotedImages({
    runtime,
    sourceMessage,
    htmlBody,
    dispatch,
    onLoaded: (images) => bodyEditorRef.current?.updateImages(images.loaded, images.failed),
  });

  const hasUserContent =
    hasComposeUserContent({ to, cc, bcc, subject, body }, form.seed ?? EMPTY_COMPOSE_FIELDS) ||
    hasComposeHtmlEdits(form);

  const { saveDraft, settleDraftSave } = useComposeDraftAutosave({
    runtime,
    enabled: Boolean(composeContext) && hasUserContent,
    to,
    cc,
    bcc,
    subject,
    body,
    htmlBody,
    identityId: selectedIdentityId,
    draftId: form.draftId,
    setDraftId: (draftId) => dispatch({ type: "draftId", draftId }),
    setDraftSaveStatus,
  });

  const sendSession = useComposeSendSession({ visible, params, draftId: form.draftId, onClose });
  const { closeSendSession } = sendSession;
  const { send, sending, canSend } = useComposeSend({
    sendScope: sendSession.scope,
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
    flushBody: () => bodyEditorRef.current?.flush() ?? Promise.resolve(null),
    finalizeQuotedImages: quotedImages.finalize,
    onSent: sendSession.onSent,
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

  const signaturePicker = useComposeSignatureActions({ dispatch, identity, settings: composeSettings, signatureChoice, richBody, bodyEditorRef });

  const templatePicker = useComposeTemplatePicker(dispatch, subject, bodyEditorRef);

  // The bar is for writing: it shows while the body is being edited or a keyboard is up, and stays out of the way otherwise.
  const toolbarVisible = bodyFocused || keyboard.open;

  const bodyTools = useComposeBodyTools({
    bodyEditorRef,
    dispatch,
    maxAttachmentBytes: runtime?.mailServerPolicy.limits.maxOutgoingAttachmentBytes,
    stripImageMetadata: composeSettings.stripImageMetadata,
    setError,
  });

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
            title={composeTitle(params.mode)}
            canSend={canSend}
            sending={sending}
            onClose={cancel}
            onSend={() => send(schedule.sendAt ?? undefined)}
            scheduledLabel={schedule.label}
            onClearSchedule={schedule.clear}
            draftSaveStatus={draftSaveStatus}
            signed={composeSettings.signOutgoingMail}
          />
        </BottomSheetHeader>
        <View style={styles.composeArea}>
        <View
          style={[
            styles.composeShell,
            // The sheet stays put under the keyboard ("extend"), so the body leaves room for the keyboard and the docked bar.
            { paddingBottom: (keyboard.settledInset || insets.bottom) + (toolbarVisible ? COMPOSE_FORMAT_BAR_HEIGHT + COMPOSE_FORMAT_BAR_GAP : 0) },
          ]}
        >
          <View style={styles.flex}>
            <ComposeFields
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
              subject={subject}
              threadReply={isThreadReply(params.mode)}
              mailboxLoading={runtimeQuery.isLoading}
              attachments={attachments}
              error={error}
            />

            {form.decrypting ? (
              <View style={styles.bodyLoading}>
                <ActivityIndicator size="small" color={skin.textTertiary} />
                <Text style={styles.noticeInline}>Decrypting draft…</Text>
              </View>
            ) : (
              <ComposeBodyEditor
                ref={bodyEditorRef}
                html={htmlBody}
                text={body}
                plainText={!richBody}
                bodySourceVersion={form.bodySourceVersion}
                onChangeHtml={(html) => dispatch({ type: "editHtml", html })}
                onBaseline={(html) => dispatch({ type: "editorBaseline", html })}
                onChangeText={(value) =>
                  dispatch({ type: "edit", field: "body", value })
                }
                onFormatState={bodyTools.setFormatState}
                onFocusChange={setBodyFocused}
                placeholder="Message"
              />
            )}
          </View>

        </View>
          <ComposeFormatDock visible={toolbarVisible} keyboard={keyboard} bottomInset={insets.bottom}>
            <ComposeFormatBar
              active={toolbarVisible}
              onSchedule={runtime?.mailServerPolicy.maxDelayedSendSeconds ? schedule.open : undefined}
              plainTextMode={!richBody}
              formatState={bodyTools.formatState}
              onFormat={(format) => bodyEditorRef.current?.format(format)}
              onLink={bodyTools.openLink}
              onInsertPhoto={bodyTools.insertPhoto}
              onAttach={bodyTools.attach}
              onChooseSignature={signaturePicker.open}
              onInsertTemplate={templatePicker.open}
            />
          </ComposeFormatDock>
        </View>
      </BottomSheet>

      <ComposeTemplatesSheet templates={composeSettings.templates} {...templatePicker.sheet} />

      <ComposeLinkSheet {...bodyTools.linkSheet} />

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

/** The send scope of one compose: discarded on close and renewed after a send, so a late result never reaches a newer compose. */
function useComposeSendSession({
  visible,
  params,
  draftId,
  onClose,
}: {
  visible: boolean;
  params: ComposeRequest;
  draftId: string | null;
  onClose: () => void;
}) {
  const currentDraftIdRef = useRef(draftId);
  useEffect(() => { currentDraftIdRef.current = draftId; }, [draftId]);
  const [sendSessionId, setSendSessionId] = useState(createMailSendSessionId);
  const [sendLifetime] = useState(createMailSendScopeLifetime);
  useEffect(() => sendLifetime.activate(() => `compose:${sendSessionId}`, () => visible ? currentDraftIdRef.current ?? (params.mode === "draft" ? params.messageId ?? null : null) : null), [sendLifetime, sendSessionId, visible, params.mode, params.messageId]);
  const scope = `compose:${sendSessionId}`;
  const closeSendSession = () => {
    discardMailSendAttempt(scope);
    onClose();
  };
  return {
    scope,
    closeSendSession,
    onSent: () => {
      if (!isMailSendScopeOpen(scope)) return;
      closeSendSession();
      setSendSessionId(createMailSendSessionId());
    },
  };
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
  richBody,
  bodyEditorRef,
}: {
  dispatch: ReturnType<typeof useComposeForm>[1];
  identity: ReturnType<typeof useComposeIdentity>;
  settings: MailComposeSettings;
  signatureChoice: ReturnType<typeof useComposeSignatureChoice>;
  richBody: boolean;
  bodyEditorRef: RefObject<ComposeBodyEditorHandle | null>;
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

  // The rich editor swaps the marked signature block itself; plain text swaps the signature's lines.
  const applySignature = (next: SignatureSource | null, insert: boolean) => {
    if (richBody) {
      bodyEditorRef.current?.applySignature({ candidates, next, ...placement, insert });
      return;
    }
    dispatch({
      type: "editBody",
      update: insert
        ? (current) =>
            replaceComposePlainTextSignature(current, candidates, next, options) ??
            insertPlainTextSignature(current, next, placement)
        : replaceIn(next),
    });
  };

  // A signature the body lacks goes where a new compose puts it.
  const onSelect = (nextChoice: string | null | undefined) => {
    setVisible(false);
    setChoice(nextChoice);
    applySignature(resolveComposeSignature(settings, identities, selectedIdentityId, kind, nextChoice), true);
  };

  const selectIdentity = (id: string) => {
    applySignature(resolveComposeSignature(settings, identities, id, kind), false);
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

/** Formatting state, the link drawer, photo insertion and attaching files for the body. */
function useComposeBodyTools({
  bodyEditorRef,
  dispatch,
  maxAttachmentBytes,
  stripImageMetadata,
  setError,
}: {
  bodyEditorRef: RefObject<ComposeBodyEditorHandle | null>;
  dispatch: ReturnType<typeof useComposeForm>[1];
  maxAttachmentBytes: number | undefined;
  stripImageMetadata: boolean;
  setError: (message: string | null) => void;
}) {
  const [formatState, setFormatState] = useState<MailEditorFormatState>(EMPTY_MAIL_EDITOR_FORMAT_STATE);
  const [linkOpen, setLinkOpen] = useState(false);
  const stripNotice = stripImageMetadata ? setError : null;
  const setLink = (href: string | null) => {
    setLinkOpen(false);
    bodyEditorRef.current?.setLink(href);
  };
  return {
    formatState,
    setFormatState,
    openLink: () => setLinkOpen(true),
    linkSheet: {
      visible: linkOpen,
      currentLink: formatState.link,
      onApply: (href: string) => setLink(href),
      onRemove: () => setLink(null),
      onDismiss: () => setLinkOpen(false),
    },
    attach: () => {
      void pickComposeAttachments(
        maxAttachmentBytes,
        stripNotice,
        (attachment) => dispatch({ type: "attach", attachment }),
        setError,
      ).catch((err: unknown) => setError(getErrorMessage(err, "Failed to attach file.")));
    },
    insertPhoto: () => {
      void pickComposePhoto(maxAttachmentBytes, stripNotice)
        .then((photo) => {
          if (photo) bodyEditorRef.current?.insertImage(photo.src, photo.alt);
        })
        .catch((err: unknown) => setError(getErrorMessage(err, "Failed to insert photo.")));
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
    bodyEditorRef.current?.insertTemplate(template.body);
  };
  return {
    open: () => setVisible(true),
    sheet: { visible, onSelect, onDismiss: () => setVisible(false) },
  };
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
    composeArea: {
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
    bodyLoading: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    noticeInline: {
      ...skin.meta,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
