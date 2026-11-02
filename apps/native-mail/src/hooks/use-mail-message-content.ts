import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMailMessage, useMailRuntime } from "../lib/mail/use-mail";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveDisplayAttachments,
} from "../lib/mail/message-security";
import { useConversationThread } from "../lib/mail/use-conversation-thread";
import { useConversationDecryptedPreviews } from "../lib/mail/use-conversation-decrypted-previews";
import type { MailDecryptResult } from "../lib/mail/mail-crypto";
import { decryptEncryptedMessage } from "../lib/mail/mail-sender-key";
import type { JmapAttachment, KeyedAttachment } from "../lib/mail/types";

export function useMailMessageContent(messageId: string) {
  const runtimeQuery = useMailRuntime(true);
  const runtime = runtimeQuery.data;

  const {
    data: messageData,
    isLoading: isMessageLoading,
    isError: isMessageError,
    error: messageError,
  } = useMailMessage(runtime, messageId);
  const message = messageData ?? null;

  const { conversationMessages, isLoading: isConversationLoading } =
    useConversationThread(runtime, message);
  const bodies = message ? extractMessageBodies(message) : null;
  const encryption = message ? classifyMessageEncryption(message) : "plain";
  const isEncrypted = encryption !== "plain";

  const {
    data: decryptResult,
    isSuccess: isDecryptSuccess,
    isLoading: isDecryptLoading,
    isFetching: isDecryptFetching,
    error: decryptQueryError,
    refetch: refetchDecrypt,
  } = useQuery<MailDecryptResult>({
    queryKey: QUERY_KEYS.mailDecrypted(messageId),
    enabled: isEncrypted && Boolean(runtime) && Boolean(message),
    retry: 1,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!runtime || !message)
        throw new Error("Runtime or message not available");
      return decryptEncryptedMessage(runtime, message);
    },
  });

  const selectedDecryptedPreview = decryptResult
    ? { text: decryptResult.plaintext, html: decryptResult.html }
    : null;

  const {
    previews: conversationPreviews,
    attachments: conversationAttachments,
  } = useConversationDecryptedPreviews(runtime, conversationMessages, {
    messageId,
    decrypted: selectedDecryptedPreview,
  });

  const htmlContent: string | null =
    decryptResult?.html ?? (isEncrypted ? null : (bodies?.html ?? null));
  const plainContent: string | null =
    decryptResult?.plaintext ??
    (isEncrypted ? null : (bodies?.text ?? null));
  const isDecrypting =
    isEncrypted && (isDecryptLoading || isDecryptFetching);
  const decryptError = isEncrypted ? decryptQueryError : null;
  const rawHtmlSource = decryptResult?.html ?? bodies?.html ?? null;

  const displayAttachments = resolveDisplayAttachments({
    encryption,
    isDecrypting,
    decryptSucceeded: isDecryptSuccess,
    decryptedAttachments: decryptResult?.attachments,
    messageAttachments: message?.attachments,
  });

  const displayAttachmentItems = keyAttachments(messageId, displayAttachments);
  // The thread as the reader stacks it; until the conversation loads it is just the open message.
  const threadMessages =
    message && !conversationMessages.some((entry) => entry.id === message.id)
      ? [message]
      : conversationMessages;
  const threadAttachments = threadMessages.flatMap((entry) =>
    entry.id === messageId
      ? displayAttachmentItems
      : keyAttachments(
          entry.id,
          resolveDisplayAttachments({
            encryption: classifyMessageEncryption(entry),
            isDecrypting: false,
            decryptSucceeded: entry.id in conversationAttachments,
            decryptedAttachments: conversationAttachments[entry.id],
            messageAttachments: entry.attachments,
          }),
        ),
  );

  return {
    runtime,
    message,
    isMessageLoading,
    isMessageError,
    messageError,
    conversationMessages,
    threadMessages,
    threadAttachments,
    isConversationLoading,
    conversationPreviews,
    encryption,
    decryptResult,
    isDecryptSuccess,
    isDecrypting,
    decryptError,
    refetchDecrypt,
    htmlContent,
    plainContent,
    rawHtmlSource,
    displayAttachments,
    displayAttachmentItems,
  };
}

function keyAttachments(
  messageId: string,
  attachments: JmapAttachment[],
): KeyedAttachment[] {
  return attachments.map((attachment, index) => ({
    key: `${messageId}:${attachment.blobId ?? index}`,
    attachment,
  }));
}
