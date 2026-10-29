import { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
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
import { LAYOUT_METRICS } from "@workspace/native-core/lib/app-layout";
import type { ComposeRequest } from "../../lib/mail/compose-request";
import {
  appendPlainTextSignature,
  getErrorMessage,
  getPlainTextSignature,
  hasComposeUserContent,
  hasPlainTextSignatureBlock,
  replacePlainTextSignatureBlock,
  type ComposeTextFields,
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
  const subjectInputRef = useRef<TextInput>(null);
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
  const signatureOptions = { separator: composeSettings.signatureSeparatorEnabled };

  const [form, dispatch] = useComposeForm({
    params,
    sourceMessage,
    settingsLoaded: composeSettingsLoaded,
    signaturePosition: composeSettings.signaturePosition,
    signatureOptions,
    identity: selectedIdentity,
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

  const { send, sending, canSend } = useComposeSend({
    runtime,
    form,
    identity: selectedIdentity,
    identityId: selectedIdentityId,
    composeContext,
    settings: composeSettings,
    signatureOptions,
    settleDraftSave,
    setError,
    onSent: onClose,
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
    onClose,
  });

  const handleInsertSignature = () => {
    if (!getPlainTextSignature(selectedIdentity)) return;
    dispatch({
      type: "editBody",
      update: (current) =>
        hasPlainTextSignatureBlock(current, selectedIdentity)
          ? current
          : appendPlainTextSignature(current, selectedIdentity, signatureOptions),
    });
  };

  const handleSelectIdentity = (id: string) => {
    const nextIdentity = identities.find((entry) => entry.id === id) ?? null;
    dispatch({
      type: "editBody",
      update: (current) =>
        replacePlainTextSignatureBlock(
          current,
          selectedIdentity,
          nextIdentity,
          signatureOptions,
        ) ?? current,
    });
    identity.pick(id);
  };

  const handleAttach = async () => {
    await pickComposeAttachment()
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
            onSend={send}
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
                onSelectIdentity={handleSelectIdentity}
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
              hasSignature={Boolean(getPlainTextSignature(selectedIdentity))}
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
        visible={identity.pickerOpen}
        identities={identities}
        selectedIdentityId={selectedIdentityId}
        onSelect={handleSelectIdentity}
        onDismiss={() => identity.setPickerOpen(false)}
      />
    </>
  );
}

/** Picks one file; the picker's cache copy is plaintext, so it is deleted once read. */
async function pickComposeAttachment(): Promise<PendingComposeAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) return null;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  }).finally(() =>
    FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined),
  );
  return createPendingComposeAttachment({
    name: asset.name ?? "attachment",
    type: asset.mimeType,
    bytes: decodeBase64ToBytes(base64),
  });
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
