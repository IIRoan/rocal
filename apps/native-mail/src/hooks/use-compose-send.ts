import { useRef, useState } from "react";
import { Alert } from "react-native";
import {
  isMailSendScopeOpen,
  getCurrentMailComposeDraftId,
  appendPlainTextSignature,
  buildReplyContext,
  canSendCompose,
  composeTextToPlain,
  getErrorMessage,
  getOutgoingAttachmentsTotalSizeError,
  hasPlainTextSignatureBlock,
  resolveComposeSendBodies,
  runTasksWithConcurrencyLimit,
  uploadPlaintextMailAttachments,
  shouldWarnAboutMissingAttachment,
  validateComposeRecipients,
  type MailComposeSettings,
} from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { extractRecentContactEntries } from "@workspace/native-core/lib/record-recent-contacts";
import { toJmapAttachmentInput } from "../lib/mail/compose-attachments";
import type { ComposeFormState } from "../lib/mail/compose-form";
import { validateComposeInput } from "../lib/mail/mail-helpers";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { resolveOutgoingMessageBody } from "../lib/mail/outgoing-message-crypto";
import type { JmapEmailMessage, JmapIdentity } from "../lib/mail/types";
import type { ComposeMode } from "../lib/mail/compose-request";
import {
  useSendMessage,
  type resolveComposeContext,
} from "../lib/mail/use-mail";

type ComposeSendInput = {
  sendScope: string;
  runtime: MailRuntime | undefined;
  mode: ComposeMode | undefined;
  sourceMessage: JmapEmailMessage | null;
  form: ComposeFormState;
  identity: JmapIdentity | null;
  identityId: string | null;
  composeContext: ReturnType<typeof resolveComposeContext>;
  settings: MailComposeSettings;
  signatureOptions: { separator: boolean };
  settleDraftSave: () => Promise<string | null>;
  setError: (message: string | null) => void;
  onSent: () => void;
};

export function useComposeSend({
  sendScope,
  runtime,
  mode,
  sourceMessage,
  form,
  identity,
  identityId,
  composeContext,
  settings,
  signatureOptions,
  settleDraftSave,
  setError,
  onSent,
}: ComposeSendInput) {
  const { toast } = useToast();
  const { recordUsage } = useRecentContacts();
  const sendMessage = useSendMessage(runtime);
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const { to, cc, bcc, subject, body, attachments } = form;
  const replyContext =
    sourceMessage && (mode === "reply" || mode === "reply-all")
      ? buildReplyContext(sourceMessage)
      : null;

  const reportSendFailure = (err: unknown) => setError(getErrorMessage(err, "Failed to send message"));
  const sendNow = async () => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    const send = async () => {
      const validation = validateComposeInput({ to, cc, bcc, subject });

      // A signature seeded above the quote already sits mid-body, so only append when it is missing.
      const bodyWithSignature = hasPlainTextSignatureBlock(body, identity)
        ? body
        : appendPlainTextSignature(body, identity, signatureOptions);
      const { plaintext, htmlBody: formattedHtml } = resolveComposeSendBodies({
        body,
        bodyWithSignature,
        encrypted: false,
      });
      const unencryptedHtml = settings.plainTextMode
        ? undefined
        : formattedHtml;
      const allRecipients = [
        ...validation.to,
        ...validation.cc,
        ...validation.bcc,
      ];

      if (!runtime) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }
      const sizeError = getOutgoingAttachmentsTotalSizeError(
        attachments.map((pending) => pending.size),
        runtime.mailServerPolicy.limits.maxOutgoingAttachmentBytes,
      );
      if (sizeError) throw new Error(sizeError);
      // The send replaces the stored draft itself, so a pending autosave would only seal a throwaway copy.
      const previousDraftId = await settleDraftSave();
      const outgoing = await resolveOutgoingMessageBody({
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
      const {
        textBody,
        encrypted,
        pgpMimeCiphertext,
        pgpMimeMessage,
        sentCopyCiphertext,
        contentFingerprint,
        isCurrent: isVaultCurrent,
      } = outgoing;
      const isCurrent = () => isMailSendScopeOpen(sendScope) && isVaultCurrent();
      const htmlBody = encrypted ? undefined : unencryptedHtml;

      // Encrypted mail carries its attachments inside the ciphertext, so only plaintext sends upload them.
      const uploadedAttachments =
        outgoing.kind !== "plaintext"
          ? []
          : await uploadPlaintextMailAttachments(outgoing, () =>
              runTasksWithConcurrencyLimit(
                attachments.map((pending) => async () => {
                  const uploaded = await uploadPlaintextMailAttachments(
                    outgoing,
                    () =>
                      runtime.client.uploadBlob(
                        runtime.session,
                        pending.bytes,
                        pending.type,
                        isCurrent,
                      ),
                  );
                  return toJmapAttachmentInput(pending, uploaded.blobId);
                }),
                runtime.mailServerPolicy.maxConcurrentUploads,
              ),
            );

      await sendMessage
        .mutateAsync({
          sendScope,
          contentFingerprint,
          isCurrent: isVaultCurrent,
          isUiCurrent: () => isMailSendScopeOpen(sendScope),
          getCurrentDraftId: getCurrentMailComposeDraftId,
          to: validation.to,
          cc: validation.cc,
          bcc: validation.bcc,
          subject: subject.trim(),
          textBody,
          htmlBody,
          identityId,
          previousDraftId,
          attachments:
            uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          pgpMimeCiphertext,
          pgpMimeMessage,
          sentCopyCiphertext,
          inReplyTo: replyContext?.inReplyTo,
          references: replyContext?.references,
        })
        .then(() => {
          const recipientValidation = validateComposeRecipients({
            to,
            cc,
            bcc,
            subject,
          });
          const entries = extractRecentContactEntries(
            [
              ...recipientValidation.to,
              ...recipientValidation.cc,
              ...recipientValidation.bcc,
            ].map((address) => ({
              email: address.email,
              displayName: address.name ?? null,
            })),
            composeContext?.fromEmail,
          );
          if (entries.length > 0) {
            recordUsage(entries, "mail");
          }
          toast(encrypted ? "Encrypted message sent" : "Message sent");
          if (isMailSendScopeOpen(sendScope)) onSent();
        });
    };
    await send()
      .catch(reportSendFailure)
      .finally(() => {
        preparingRef.current = false;
        setPreparing(false);
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
      enabled: settings.attachmentReminderEnabled,
      attachmentCount: attachments.length,
      subject,
      bodyText: composeTextToPlain(body),
      keywords: settings.attachmentReminderKeywords,
    });
    if (missingAttachmentKeyword) {
      Alert.alert(
        "Forgot an attachment?",
        `Your message mentions “${missingAttachmentKeyword}” but no files are attached.`,
        [
          { text: "Go back", style: "cancel" },
          { text: "Send anyway", onPress: () => void sendNow().catch(reportSendFailure) },
        ],
      );
      return;
    }
    void sendNow().catch(reportSendFailure);
  };

  const canSend =
    Boolean(composeContext) &&
    !preparing &&
    !sendMessage.isPending &&
    !form.decrypting &&
    canSendCompose({
      to,
      cc,
      bcc,
      subject,
      bodyText: composeTextToPlain(body),
      attachmentCount: attachments.length,
    });

  return {
    send: handleSend,
    sending: preparing || sendMessage.isPending,
    canSend,
  };
}
