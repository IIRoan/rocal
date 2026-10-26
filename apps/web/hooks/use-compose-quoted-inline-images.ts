"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { createLogger } from "@workspace/logger";
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
  readBlobAsDataUrl,
  registerComposeInlineImage,
} from "@/lib/mail/compose-inline-images";

type ActiveMailbox = {
  client: StalwartJmapClient;
  session: JmapSession;
};

const log = createLogger("compose-quoted-inline-images");

/** Downloads one quoted inline image and registers it for sending; null when it cannot be previewed. */
async function loadQuotedInlineImage(
  activeMailbox: ActiveMailbox,
  attachment: QuotedInlineAttachment & { cid: string; blobId: string },
  isCancelled: () => boolean,
): Promise<string | null> {
  try {
    const blob = await activeMailbox.client.downloadBlob(
      activeMailbox.session,
      attachment.blobId,
      attachment.name || "inline",
      attachment.type || "application/octet-stream",
    );
    if (isCancelled()) return null;
    const dataUrl = await readBlobAsDataUrl(blob);
    if (isCancelled()) return null;
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
    return dataUrl;
  } catch {
    // Inline preview is best-effort; send still carries the original blob.
    return null;
  }
}

export function useComposeQuotedInlineImages({
  enabled,
  setHtmlBody,
  quotedAttachments,
  activeMailbox,
}: {
  enabled: boolean;
  setHtmlBody: Dispatch<SetStateAction<string>>;
  quotedAttachments: QuotedInlineAttachment[];
  activeMailbox: ActiveMailbox | null;
}) {
  useEffect(() => {
    if (!enabled || !activeMailbox) return;
    if (quotedAttachments.length === 0) return;

    const inlineAttachments = quotedAttachments.filter(
      (attachment): attachment is QuotedInlineAttachment & {
        cid: string;
        blobId: string;
      } =>
        Boolean(attachment.cid) &&
        attachment.disposition === "inline" &&
        (attachment.type || "").startsWith("image/") &&
        Boolean(attachment.blobId),
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
      const updates = new Map<string, string>();
      for (const attachment of inlineAttachments) {
        const existing = getComposeInlineImages().find(
          (entry) => entry.cid === attachment.cid,
        );
        const dataUrl = existing
          ? existing.dataUrl
          : await loadQuotedInlineImage(
            activeMailbox,
            attachment,
            () => cancelled,
          );
        if (cancelled) return;
        if (dataUrl) {
          updates.set(attachment.cid, dataUrl);
        }
      }
      if (updates.size === 0) return;
      setHtmlBody((current) =>
        replaceInlineImagePlaceholders(current, updates),
      );
    })()
      .finally(finishHydration)
      .catch((error) => {
        log.error("Failed to hydrate quoted inline images", error);
      });

    return () => {
      cancelled = true;
      finishHydration();
    };
  }, [enabled, activeMailbox, quotedAttachments, setHtmlBody]);
}
