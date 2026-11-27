import { useRef, useState } from "react";
import { Alert } from "react-native";
import {
  isMailSendScopeOpen,
  getCurrentMailComposeDraftId,
  buildReplyContext,
  canSendCompose,
  extractComposeInlineImages,
  getEmbeddedImagesSizeError,
  getErrorMessage,
  getOutgoingAttachmentsTotalSizeError,
  newClientEntityId,
  resolveOutgoingComposeBodies,
  runTasksWithConcurrencyLimit,
  selfCopyWithEmbeddedImages,
  uploadPlaintextMailAttachments,
  shouldWarnAboutMissingAttachment,
  validateComposeRecipients,
  resolveEncryptionInternalDomain,
  resolveMailSendHold,
  shouldEncryptOutgoingMail,
  type JmapAttachmentInput,
  type MailComposeSettings,
  type OutgoingMimeAttachment,
} from "@workspace/calendar-core";
import { useHeldSendToast } from "./use-held-send-toast";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { extractRecentContactEntries } from "@workspace/native-core/lib/record-recent-contacts";
import type { ComposeFormState } from "../lib/mail/compose-form";
import { validateComposeInput } from "../lib/mail/mail-helpers";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { resolveOutgoingMessageBody } from "../lib/mail/outgoing-message-crypto";
import type { JmapEmailMessage } from "../lib/mail/types";
import type { ComposeMode, ComposeRequest } from "../lib/mail/compose-request";
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
  identityId: string | null;
  composeContext: ReturnType<typeof resolveComposeContext>;
  settings: MailComposeSettings;
  settleDraftSave: () => Promise<string | null>;
  setError: (message: string | null) => void;
  onSent: () => void;
  /** Reopens compose after an undone send. */
  onRestore: (request: ComposeRequest) => void;
  /** The rich editor's latest HTML, including keystrokes it has not posted yet. */
  flushBody?: () => Promise<string | null>;
  /** Waits for quoted images and drops any that never loaded. */
  finalizeQuotedImages?: (html: string) => Promise<string>;
};

function countInlineImages(html: string): number {
  return html.match(/<img\b/gi)?.length ?? 0;
}

export function useComposeSend({
  sendScope,
  runtime,
  mode,
  sourceMessage,
  form,
  identityId,
  composeContext,
  settings,
  settleDraftSave,
  setError,
  onSent,
  onRestore,
  flushBody,
  finalizeQuotedImages,
}: ComposeSendInput) {
  const { toast } = useToast();
  const { recordUsage } = useRecentContacts();
  const sendMessage = useSendMessage(runtime);
  const announceHeldSend = useHeldSendToast(runtime, onRestore);
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const { to, cc, bcc, subject, body, attachments } = form;
  const htmlBody = settings.plainTextMode ? "" : form.htmlBody;
  const replyContext =
    sourceMessage && (mode === "reply" || mode === "reply-all")
      ? buildReplyContext(sourceMessage)
      : null;

  const reportSendFailure = (err: unknown) => setError(getErrorMessage(err, "Failed to send message"));
  const sendNow = async (sendAt?: string) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    const send = async () => {
      const validation = validateComposeInput({ to, cc, bcc, subject });
      // An editor that has not loaded yet answers with an empty body, which must not replace the seeded one.
      const editedHtml = htmlBody.trim() ? ((await flushBody?.()) || htmlBody) : "";
      const sentHtml = editedHtml && finalizeQuotedImages ? await finalizeQuotedImages(editedHtml) : editedHtml;

      // The signature is ordinary body text by now, so the message goes out exactly as written.
      const { textBody: plaintext, htmlBody: outgoingHtml } = resolveOutgoingComposeBodies({
        body,
        htmlBody: sentHtml,
      });
      const allRecipients = [
        ...validation.to,
        ...validation.cc,
        ...validation.bcc,
      ];

      if (!runtime) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }
      const willEncrypt = shouldEncryptOutgoingMail(
        allRecipients,
        resolveEncryptionInternalDomain(runtime.config.defaultDomain),
      );
      const { hold, error: holdError } = resolveMailSendHold({
        sendAt,
        undoSendSeconds: settings.undoSendSeconds,
        policy: runtime.mailServerPolicy,
        hasExternalRecipients: !willEncrypt,
        now: Date.now(),
      });
      if (holdError) throw new Error(holdError);
      const snapshot = {
        fields: { to, cc, bcc, subject, body, htmlBody: sentHtml },
        attachments,
      };
      // Solace's reader drops cid parts of decrypted mail, so encrypted mail keeps its images inline as data URLs.
      const inline =
        outgoingHtml && !willEncrypt
          ? extractComposeInlineImages(outgoingHtml, () => `${newClientEntityId()}@solace`)
          : { html: outgoingHtml, images: [] };
      const embeddedImagesError = willEncrypt ? getEmbeddedImagesSizeError(outgoingHtml) : null;
      if (embeddedImagesError) throw new Error(embeddedImagesError);
      const fileParts: OutgoingMimeAttachment[] = attachments.map((pending) => ({
        filename: pending.name,
        contentType: pending.type,
        content: pending.bytes,
      }));
      const mimeParts: OutgoingMimeAttachment[] = [
        ...inline.images.map((image) => ({ ...image, disposition: "inline" as const })),
        ...fileParts,
      ];
      const selfCopy = selfCopyWithEmbeddedImages({ text: plaintext, html: inline.html, attachments: fileParts }, outgoingHtml);
      const sizeError = getOutgoingAttachmentsTotalSizeError(
        mimeParts.map((part) => part.content.byteLength),
        runtime.mailServerPolicy.limits.maxOutgoingAttachmentBytes,
      );
      if (sizeError) throw new Error(sizeError);
      // The send replaces the stored draft itself, so a pending autosave would only seal a throwaway copy.
      const previousDraftId = await settleDraftSave();
      const outgoing = await resolveOutgoingMessageBody({
        runtime,
        recipients: allRecipients,
        plaintext,
        html: inline.html,
        mimeAttachments: mimeParts,
        // The Sent copy keeps its images embedded, since the reader drops cid parts of decrypted mail.
        sentCopyContent: selfCopy.html === inline.html ? undefined : selfCopy,
        sign: settings.signOutgoingMail,
      });
      const {
        textBody,
        encrypted,
        pgpMimeCiphertext,
        pgpMimeMessage,
        signedMimeMessage,
        sentCopyCiphertext,
        contentFingerprint,
        isCurrent: isVaultCurrent,
      } = outgoing;
      const isCurrent = () => isMailSendScopeOpen(sendScope) && isVaultCurrent();
      const sentHtmlBody = encrypted || signedMimeMessage ? undefined : inline.html;

      // Encrypted mail carries its attachments inside the ciphertext, so only plaintext sends upload them.
      const uploadedAttachments =
        outgoing.kind !== "plaintext"
          ? []
          : await uploadPlaintextMailAttachments(outgoing, () =>
              runTasksWithConcurrencyLimit<JmapAttachmentInput>(
                mimeParts.map((part) => async () => {
                  const uploaded = await uploadPlaintextMailAttachments(outgoing, () =>
                    runtime.client.uploadBlob(runtime.session, part.content, part.contentType, isCurrent),
                  );
                  return {
                    blobId: uploaded.blobId,
                    name: part.filename,
                    type: part.contentType,
                    size: part.content.byteLength,
                    disposition: part.disposition,
                    cid: part.cid,
                  };
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
          htmlBody: sentHtmlBody,
          identityId,
          previousDraftId,
          attachments:
            uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
          pgpMimeCiphertext,
          pgpMimeMessage,
          signedMimeMessage,
          sentCopyCiphertext,
          inReplyTo: replyContext?.inReplyTo,
          references: replyContext?.references,
          hold,
        })
        .then((receipt) => {
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
          const sentMessage = encrypted ? "Encrypted message sent" : signedMimeMessage ? "Signed message sent" : "Message sent";
          if (hold && receipt.emailId) {
            announceHeldSend({
              hold,
              receipt,
              reopen: {
                mode: mode === "draft" ? undefined : mode,
                messageId: mode === "draft" ? undefined : sourceMessage?.id,
                restore: { ...snapshot, draftId: receipt.emailId },
              },
            });
          } else {
            toast(sentMessage);
          }
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

  const handleSend = (sendAt?: string) => {
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
      bodyText: body,
      keywords: settings.attachmentReminderKeywords,
    });
    if (missingAttachmentKeyword) {
      Alert.alert(
        "Forgot an attachment?",
        `Your message mentions “${missingAttachmentKeyword}” but no files are attached.`,
        [
          { text: "Go back", style: "cancel" },
          { text: "Send anyway", onPress: () => void sendNow(sendAt).catch(reportSendFailure) },
        ],
      );
      return;
    }
    void sendNow(sendAt).catch(reportSendFailure);
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
      bodyText: body,
      attachmentCount: attachments.length + countInlineImages(htmlBody),
    });

  return {
    send: handleSend,
    sending: preparing || sendMessage.isPending,
    canSend,
  };
}
