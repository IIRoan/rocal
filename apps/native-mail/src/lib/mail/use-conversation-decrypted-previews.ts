import { useCallback, useEffect, useMemo } from "react";
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
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

const MAX_CONCURRENT_PREVIEW_DECRYPTS = 2;
let activePreviewDecrypts = 0;
const queuedPreviewDecrypts: (() => void)[] = [];

/** Keeps list previews from saturating the JS thread and network while the reader decrypts. */
async function withPreviewDecryptSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activePreviewDecrypts >= MAX_CONCURRENT_PREVIEW_DECRYPTS) {
    // The releasing task hands its slot over, so the count stays accurate.
    await new Promise<void>((resolve) => queuedPreviewDecrypts.push(resolve));
  } else {
    activePreviewDecrypts += 1;
  }
  try {
    return await task();
  } finally {
    const next = queuedPreviewDecrypts.shift();
    if (next) {
      next();
    } else {
      activePreviewDecrypts -= 1;
    }
  }
}

type SelectedDecryptedPreview = {
  messageId: string | null;
  decrypted: DecryptedMailPreviewContent | null;
};

export function useConversationDecryptedPreviews(
  runtime: MailRuntime | undefined,
  messages: JmapEmailMessage[],
  selected?: SelectedDecryptedPreview,
): Record<string, string> {
  const queryClient = useQueryClient();
  const selectedMessageId = selected?.messageId ?? null;
  const selectedDecrypted = selected?.decrypted ?? null;

  const encryptedMessages = useMemo(
    () => messages.filter((message) => messageNeedsDecryptedPreview(message)),
    [messages],
  );

  // A stable combine keeps the map (and every list row) unchanged until a decrypt actually lands.
  const combineDecrypted = useCallback(
    (results: UseQueryResult<MailDecryptResult>[]) => {
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
    [encryptedMessages],
  );

  const queries = useMemo(
    () =>
      encryptedMessages.map((message) => {
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
    [encryptedMessages, runtime, selectedDecrypted, selectedMessageId],
  );

  const decryptedById = useQueries({
    queries: queries.map((query) => ({ ...query, enabled: false })),
    combine: combineDecrypted,
  });

  useEffect(() => {
    let cancelled = false;
    for (const query of queries) {
      if (!query.enabled) continue;
      // Queue before starting the shared query so the reader can decrypt immediately.
      // Prefetch failures land in the query cache, where the reader surfaces them.
      void withPreviewDecryptSlot(async () => {
        if (!cancelled) await queryClient.prefetchQuery(query);
      }).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [queries, queryClient]);

  return useMemo(() => {
    const previews: Record<string, string> = {};
    for (const message of encryptedMessages) {
      const selectedOverride =
        message.id === selectedMessageId ? selectedDecrypted : null;
      const decrypted =
        selectedOverride ?? decryptedById.get(message.id) ?? null;
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
