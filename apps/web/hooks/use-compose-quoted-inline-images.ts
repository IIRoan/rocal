"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapSession } from "@/lib/mail/types";
import {
  replaceInlineImagePlaceholders,
  type QuotedInlineAttachment,
} from "@/lib/mail/compose-editor-utils";
import {
  beginQuotedInlineImageHydration,
  completeQuotedInlineImageHydration,
  getComposeInlineImages,
  registerComposeInlineImage,
} from "@/lib/mail/compose-inline-images";

type ActiveMailbox = {
  client: StalwartJmapClient;
  session: JmapSession;
};

export function useComposeQuotedInlineImages(input: {
  enabled: boolean;
  setHtmlBody: Dispatch<SetStateAction<string>>;
  quotedAttachments: QuotedInlineAttachment[];
  activeMailbox: ActiveMailbox | null;
}) {
  useEffect(() => {
    if (!input.enabled || !input.activeMailbox) return;
    if (input.quotedAttachments.length === 0) return;

    const inlineAttachments = input.quotedAttachments.filter(
      (attachment) =>
        attachment.cid &&
        attachment.disposition === "inline" &&
        (attachment.type || "").startsWith("image/") &&
        attachment.blobId,
    );
    if (inlineAttachments.length === 0) return;

    let cancelled = false;
    let hydrationFinished = false;
    const finishHydration = () => {
      if (hydrationFinished) return;
      hydrationFinished = true;
      completeQuotedInlineImageHydration();
    };

    beginQuotedInlineImageHydration();
    void (async () => {
      try {
        const updates = new Map<string, string>();
        for (const attachment of inlineAttachments) {
          if (!attachment.cid || !attachment.blobId) continue;
          if (
            getComposeInlineImages().some((entry) => entry.cid === attachment.cid)
          ) {
            const existing = getComposeInlineImages().find(
              (entry) => entry.cid === attachment.cid,
            );
            if (existing?.dataUrl) {
              updates.set(attachment.cid, existing.dataUrl);
            }
            continue;
          }
          try {
            const blob = await input.activeMailbox!.client.downloadBlob(
              input.activeMailbox!.session,
              attachment.blobId,
              attachment.name || "inline",
              attachment.type || "application/octet-stream",
            );
            if (cancelled) return;
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            if (cancelled) return;
            const buffer = await blob.arrayBuffer();
            registerComposeInlineImage({
              cid: attachment.cid,
              blobId: attachment.blobId,
              type: attachment.type || "application/octet-stream",
              name: attachment.name || "inline",
              size: attachment.size ?? buffer.byteLength,
              dataUrl,
              content: new Uint8Array(buffer),
            });
            updates.set(attachment.cid, dataUrl);
          } catch {
            // Inline preview is best-effort; send still carries the original blob.
          }
        }
        if (cancelled || updates.size === 0) return;
        input.setHtmlBody((current) =>
          replaceInlineImagePlaceholders(current, updates),
        );
      } finally {
        finishHydration();
      }
    })();

    return () => {
      cancelled = true;
      finishHydration();
    };
    // Hydrate once per quoted attachment set when compose opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.enabled,
    input.activeMailbox,
    input.quotedAttachments,
    input.setHtmlBody,
  ]);
}
