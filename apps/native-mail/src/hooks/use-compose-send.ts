import { Alert } from "react-native";
import {
  appendPlainTextSignature,
  canSendCompose,
  composeTextToPlain,
  getErrorMessage,
  getOutgoingAttachmentsTotalSizeError,
  hasPlainTextSignatureBlock,
  resolveComposeSendBodies,
  runTasksWithConcurrencyLimit,
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
import type { JmapIdentity } from "../lib/mail/types";
import { useSendMessage, type resolveComposeContext } from "../lib/mail/use-mail";

type ComposeSendInput = {
  runtime: MailRuntime | undefined;
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
  runtime,
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
  const { to, cc, bcc, subject, body, attachments } = form;

  const sendNow = async () => {
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
    const unencryptedHtml = settings.plainTextMode ? undefined : formattedHtml;
    const allRecipients = [
      ...validation.to,
      ...validation.cc,
      ...validation.bcc,
    ];

    const send = async () => {
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

      sendMessage.mutate(
        {
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
            onSent();
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
          { text: "Send anyway", onPress: () => void sendNow() },
        ],
      );
      return;
    }
    void sendNow();
  };

  const canSend =
    Boolean(composeContext) &&
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

  return { send: handleSend, sending: sendMessage.isPending, canSend };
}
