import { useEffect, useEffectEvent, useRef, type Dispatch } from "react";
import {
  dropInlineImagePlaceholders,
  htmlHasUnhydratedInlinePlaceholders,
  INLINE_IMAGE_PLACEHOLDER,
  replaceInlineImagePlaceholders,
} from "@workspace/calendar-core";
import { bytesToBase64 } from "../lib/mail/binary-utils";
import type { ComposeFormAction } from "../lib/mail/compose-form";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";

export type QuotedImages = {
  loaded: ReadonlyMap<string, string>;
  failed: ReadonlySet<string>;
};

const NO_IMAGES: QuotedImages = { loaded: new Map(), failed: new Set() };
const IMG_TAG = /<img\b[^>]*>/gi;
const EMBEDDABLE_IMAGE = /^image\/(?:png|gif|jpe?g|webp|bmp|avif)$/i;

/** Downloads the quoted message's inline images as data URLs; one that cannot be loaded or shown is reported as failed. */
export async function loadQuotedImages(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<QuotedImages> {
  const loaded = new Map<string, string>();
  const failed = new Set<string>();
  const inline = (message.attachments ?? []).filter(
    (attachment) => attachment.cid && attachment.disposition === "inline" && attachment.blobId,
  );
  await Promise.all(
    inline.map(async (attachment) => {
      const cid = attachment.cid ?? "";
      const type = attachment.type ?? "";
      if (!EMBEDDABLE_IMAGE.test(type) || !attachment.blobId) {
        failed.add(cid);
        return;
      }
      await runtime.client
        .downloadBlob(runtime.session, attachment.blobId, attachment.name || "inline", type)
        .then(
          (bytes) => loaded.set(cid, `data:${type.toLowerCase()};base64,${bytesToBase64(bytes)}`),
          () => failed.add(cid),
        );
    }),
  );
  return { loaded, failed };
}

/** Fills a quote's loaded images and drops every image still waiting, so a send never carries a placeholder. */
export function finalizeQuotedImages(html: string, images: QuotedImages): string {
  const filled = dropInlineImagePlaceholders(replaceInlineImagePlaceholders(html, images.loaded), images.failed);
  return filled.replace(IMG_TAG, (tag) => (tag.includes(INLINE_IMAGE_PLACEHOLDER) ? "" : tag));
}

/** Loads a reply or forward's quoted inline images once its body shows their placeholders. */
export function useComposeQuotedImages({
  runtime,
  sourceMessage,
  htmlBody,
  dispatch,
  onLoaded,
}: {
  runtime: MailRuntime | undefined;
  sourceMessage: JmapEmailMessage | null;
  htmlBody: string;
  dispatch: Dispatch<ComposeFormAction>;
  /** Puts the loaded images into the open editor without replacing its content. */
  onLoaded: (images: QuotedImages) => void;
}) {
  const pendingRef = useRef<Promise<QuotedImages>>(Promise.resolve(NO_IMAGES));
  const hasPlaceholders = htmlHasUnhydratedInlinePlaceholders(htmlBody);
  const start = useEffectEvent((isCancelled: () => boolean) => {
    if (!runtime || !sourceMessage) return;
    pendingRef.current = loadQuotedImages(runtime, sourceMessage).then((images) => {
      if (!isCancelled()) {
        dispatch({ type: "hydrateImages", cidToDataUrl: images.loaded, failed: images.failed });
        onLoaded(images);
      }
      return images;
    });
  });
  const ready = Boolean(runtime && sourceMessage);
  useEffect(() => {
    if (!hasPlaceholders || !ready) return;
    let cancelled = false;
    start(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [hasPlaceholders, ready]);

  return {
    /** Waits for loading quoted images, then returns `html` with them in place and none left waiting. */
    finalize: async (html: string) => finalizeQuotedImages(html, await pendingRef.current),
  };
}
