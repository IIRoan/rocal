"use client";

import { useEffect, useEffectEvent, type Dispatch, type SetStateAction } from "react";
import { createLogger } from "@workspace/logger";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapSession } from "@/lib/mail/types";
import { dropInlineImagePlaceholders, replaceInlineImagePlaceholders } from "@workspace/calendar-core";
import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
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
    // A quoted image that cannot be loaded is dropped from the quote rather than blocking the send.
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
  // The setter is rebuilt each render; an event keeps the downloads from restarting on every keystroke.
  const applyLoadedImages = useEffectEvent((updates: Map<string, string>, failed: Set<string>) =>
    setHtmlBody((current) => dropInlineImagePlaceholders(replaceInlineImagePlaceholders(current, updates), failed)),
  );
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
      const failed = new Set<string>();
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
        } else {
          failed.add(attachment.cid);
        }
      }
      if (updates.size === 0 && failed.size === 0) return;
      applyLoadedImages(updates, failed);
    })()
      .finally(finishHydration)
      .catch((error) => {
        log.error("Failed to hydrate quoted inline images", error);
      });

    return () => {
      cancelled = true;
      finishHydration();
    };
  }, [enabled, activeMailbox, quotedAttachments]);
}
