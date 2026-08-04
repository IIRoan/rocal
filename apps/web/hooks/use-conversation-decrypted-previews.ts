"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { MailDemoConfig } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import {
  buildMailPreviewSnippet,
  messageNeedsDecryptedPreview,
  type DecryptedMailPreviewContent,
} from "@/lib/mail/mail-preview";
import {
  fetchMailMessageById,
  findCachedMailMessage,
} from "@/lib/mail/mail-message-query";
import { messageHasLoadedBody } from "@/lib/mail/mail-message-body";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";

const log = createLogger("conversation-decrypted-previews");

type UseConversationDecryptedPreviewsInput = {
  messages: JmapEmailMessage[];
  client: StalwartJmapClient | null | undefined;
  session: JmapSession | null | undefined;
  config: MailDemoConfig | null | undefined;
  selectedMessageId?: string | null;
  selectedDecrypted?: DecryptedMailPreviewContent | null;
};

async function loadMessageForPreview(input: {
  message: JmapEmailMessage;
  client: StalwartJmapClient;
  session: JmapSession;
  queryClient: ReturnType<typeof useQueryClient>;
}): Promise<JmapEmailMessage> {
  if (messageHasLoadedBody(input.message)) {
    return input.message;
  }
  const cached = findCachedMailMessage(input.queryClient, input.message.id);
  if (cached && messageHasLoadedBody(cached)) {
    return cached;
  }
  return fetchMailMessageById(input.queryClient, {
    client: input.client,
    session: input.session,
    messageId: input.message.id,
    requireBody: true,
  });
}

async function resolveDecryptedPreview(input: {
  message: JmapEmailMessage;
  client: StalwartJmapClient;
  session: JmapSession;
  config: MailDemoConfig | null | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}): Promise<DecryptedMailPreviewContent> {
  const fullMessage = await loadMessageForPreview(input);
  const encryption = classifyMessageEncryption(fullMessage);

  if (encryption === "inline_pgp" || encryption === "pgp_mime") {
    try {
      return await decryptMessageForCompose({
        client: input.client,
        session: input.session,
        message: fullMessage,
        config: input.config,
      });
    } catch {
      log.warn("Failed to decrypt conversation preview", {
        messageId: input.message.id,
      });
      return { text: null, html: null };
    }
  }

  // List preview can look armored while the full body is plaintext.
  const bodies = extractMessageBodies(fullMessage);
  return { text: bodies.text, html: bodies.html };
}

export function useConversationDecryptedPreviews(
  input: UseConversationDecryptedPreviewsInput,
): Record<string, string> {
  const queryClient = useQueryClient();
  const {
    messages,
    client,
    session,
    config,
    selectedMessageId,
    selectedDecrypted,
  } = input;

  const encryptedMessages = messages.filter((message) =>
    messageNeedsDecryptedPreview(message),
  );

  const decryptedById = useQueries({
    queries: encryptedMessages.map((message) => {
      const hasSelectedDecrypt =
        message.id === selectedMessageId &&
        Boolean(selectedDecrypted?.text || selectedDecrypted?.html);

      return {
        queryKey: [
          ...mailQueryKeys.message(message.id),
          "decrypted-preview",
        ] as const,
        enabled: Boolean(client && session) && !hasSelectedDecrypt,
        retry: 1,
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
        queryFn: (): Promise<DecryptedMailPreviewContent> => {
          if (!client || !session) {
            throw new Error("Mail session not available");
          }
          return resolveDecryptedPreview({
            message,
            client,
            session,
            config,
            queryClient,
          });
        },
      };
    }),
    combine: (results) => {
      const map = new Map<string, DecryptedMailPreviewContent>();
      for (let index = 0; index < encryptedMessages.length; index += 1) {
        const message = encryptedMessages[index];
        const data = results[index]?.data;
        if (message && data) {
          map.set(message.id, data);
        }
      }
      return map;
    },
  });

  const previews: Record<string, string> = {};
  for (const message of encryptedMessages) {
    const selectedOverride =
      message.id === selectedMessageId ? selectedDecrypted : null;
    const decrypted = selectedOverride ?? decryptedById.get(message.id) ?? null;
    if (!decrypted) {
      continue;
    }
    const snippet = buildMailPreviewSnippet(message, decrypted);
    if (snippet) {
      previews[message.id] = snippet;
    }
  }
  return previews;
}
