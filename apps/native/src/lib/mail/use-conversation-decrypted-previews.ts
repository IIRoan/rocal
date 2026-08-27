import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { QUERY_KEYS } from "../query-keys";
import type { MailDecryptResult } from "./mail-crypto";
import {
  listPreviewSnippet,
  messageNeedsDecryptedPreview,
  type DecryptedMailPreviewContent,
} from "./mail-preview";
import { classifyMessageEncryption } from "./message-security";
import { decryptEncryptedMessage } from "./mail-sender-key";
import type { JmapEmailMessage } from "./types";
import type { MailRuntime } from "./mail-runtime";

type SelectedDecryptedPreview = {
  messageId: string | null;
  decrypted: DecryptedMailPreviewContent | null;
};

export function useConversationDecryptedPreviews(
  runtime: MailRuntime | undefined,
  messages: JmapEmailMessage[],
  selected?: SelectedDecryptedPreview,
): Record<string, string> {
  const selectedMessageId = selected?.messageId ?? null;
  const selectedDecrypted = selected?.decrypted ?? null;

  const encryptedMessages = useMemo(
    () => messages.filter((message) => messageNeedsDecryptedPreview(message)),
    [messages],
  );

  const decryptedById = useQueries({
    queries: encryptedMessages.map((message) => {
      const encryption = classifyMessageEncryption(message);
      const hasSelectedDecrypt =
        message.id === selectedMessageId &&
        Boolean(selectedDecrypted?.text || selectedDecrypted?.html);

      return {
        queryKey: QUERY_KEYS.mailDecrypted(message.id),
        enabled:
          Boolean(runtime) &&
          (encryption === "inline_pgp" || encryption === "pgp_mime") &&
          !hasSelectedDecrypt,
        retry: 1,
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
        queryFn: async (): Promise<MailDecryptResult> => {
          if (!runtime) {
            throw new Error("Runtime not available");
          }
          return decryptEncryptedMessage(runtime, message);
        },
      };
    }),
    combine: (results) => {
      const map = new Map<string, DecryptedMailPreviewContent>();
      for (let index = 0; index < encryptedMessages.length; index += 1) {
        const message = encryptedMessages[index];
        const data = results[index]?.data;
        if (message && data) {
          map.set(message.id, {
            text: data.plaintext,
            html: data.html,
          });
        }
      }
      return map;
    },
  });

  return useMemo(() => {
    const previews: Record<string, string> = {};
    for (const message of encryptedMessages) {
      const selectedOverride =
        message.id === selectedMessageId ? selectedDecrypted : null;
      const decrypted = selectedOverride ?? decryptedById.get(message.id) ?? null;
      if (!decrypted) {
        continue;
      }
      const snippet = listPreviewSnippet(message, decrypted);
      if (snippet) {
        previews[message.id] = snippet;
      }
    }
    return previews;
  }, [decryptedById, encryptedMessages, selectedDecrypted, selectedMessageId]);
}
