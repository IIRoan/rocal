"use client";

import Image from "next/image";
import {
  ChevronDown,
  Download,
  Eye,
  Loader2,
  Paperclip,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/ui/collapsible";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
import { resolveAttachmentPreviewKind } from "@/lib/mail/attachment-preview";
import { PdfAttachmentThumbnail } from "../attachment-preview-dialog";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderHeaderAttachments({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    isMobile,
    displayAttachments,
    attachmentHoverPreviews,
    loadingAttachmentPreviewKey,
    handleLoadAttachmentHoverPreview,
    props,
  } = controller;
  const { onPreviewAttachment, onDownloadAttachment, onLoadAttachmentPreview } = props;

  return (
    <>
      {/* Attachments */}
      {displayAttachments.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "group flex items-center font-medium text-muted-foreground transition-colors hover:text-foreground",
                isMobile
                  ? "gap-1 py-0 text-[11px]"
                  : "gap-1.5 py-0.5 text-[12px]",
              )}
            >
              Attachments ({displayAttachments.length})
              <ChevronDown
                className="size-3 transition-transform group-data-[state=open]:rotate-180"
                strokeWidth={2}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className={cn(
                "flex flex-wrap",
                isMobile ? "gap-1.5 pt-1" : "gap-2 pt-1.5",
              )}
            >
              {displayAttachments.map((attachment, idx) => {
                const name = attachment.name?.trim() || "Attachment";
                const mimeType = attachment.type ?? "";
                const previewKind = resolveAttachmentPreviewKind(attachment);
                const attachmentKey =
                  attachment.blobId ??
                  `${name}:${mimeType}:${attachment.size ?? "inline"}`;
                const previewKey = `${attachmentKey}:${name}:${mimeType}`;
                const hoverPreview = attachmentHoverPreviews[previewKey];
                const ext = mimeType.split("/")[1]?.toUpperCase() ?? "";
                const canAccessAttachment = Boolean(
                  (attachment.blobId || attachment.content != null) &&
                  (onPreviewAttachment || onDownloadAttachment),
                );
                const canPreview = Boolean(
                  canAccessAttachment && onPreviewAttachment && previewKind,
                );
                const canDownload = Boolean(
                  (attachment.blobId || attachment.content != null) &&
                  onDownloadAttachment,
                );
                const attachmentButton = (
                  <Button
                    variant="secondary"
                    size="xs"
                    type="button"
                    onClick={
                      canPreview
                        ? () => onPreviewAttachment!(attachment)
                        : canDownload
                          ? () => onDownloadAttachment!(attachment)
                          : undefined
                    }
                    onMouseEnter={() =>
                      canPreview && onLoadAttachmentPreview
                        ? handleLoadAttachmentHoverPreview(
                            attachment,
                            previewKey,
                          )
                        : undefined
                    }
                    onFocus={() =>
                      canPreview && onLoadAttachmentPreview
                        ? handleLoadAttachmentHoverPreview(
                            attachment,
                            previewKey,
                          )
                        : undefined
                    }
                    aria-label={`${canPreview ? "Preview" : "Download"} ${name}`}
                    className={cn(
                      canPreview || canDownload
                        ? "cursor-pointer"
                        : "cursor-default",
                      isMobile ? "h-5 gap-1 px-1.5 text-[10px]" : "",
                    )}
                  >
                    {canPreview ? (
                      <Eye />
                    ) : canDownload ? (
                      <Download />
                    ) : (
                      <Paperclip />
                    )}
                    <span className="font-normal">{name}</span>
                    {ext && (
                      <span className="font-normal text-muted-foreground">
                        {ext}
                      </span>
                    )}
                  </Button>
                );
                return (
                  <div
                    key={attachmentKey}
                    className="group/attachment relative flex items-center gap-1"
                  >
                    {attachmentButton}
                    {canPreview && onLoadAttachmentPreview && (
                      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-[min(22rem,calc(100vw-2rem))] group-hover/attachment:block group-focus-within/attachment:block">
                        <div className="bg-popover text-popover-foreground overflow-hidden rounded-md border border-border/60 shadow-md">
                          {loadingAttachmentPreviewKey === previewKey ? (
                            <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm">
                              <Loader2 className="size-4 animate-spin" />
                              Loading preview
                            </div>
                          ) : hoverPreview?.kind === "image" ? (
                            <div className="space-y-2 p-2">
                              <Image
                                src={hoverPreview.url}
                                alt={name}
                                width={352}
                                height={176}
                                unoptimized
                                className="max-h-44 w-full rounded-md border border-border/60 object-contain"
                              />
                            </div>
                          ) : hoverPreview?.kind === "text" ? (
                            <div className="space-y-2 p-2">
                              <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                {previewKind === "text"
                                  ? "Text preview"
                                  : "Preview"}
                              </div>
                              <pre className="max-h-44 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-5">
                                {hoverPreview.text}
                              </pre>
                            </div>
                          ) : hoverPreview?.kind === "pdf" ? (
                            <div className="space-y-2 p-2">
                              <PdfAttachmentThumbnail url={hoverPreview.url} />
                              <div className="text-muted-foreground text-xs">
                                Open inline to scroll the full document.
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground px-3 py-2 text-sm">
                              Preview unavailable.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {canPreview && canDownload && (
                      <Button
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => onDownloadAttachment!(attachment)}
                        aria-label={`Download ${name}`}
                        className={cn(
                          "cursor-pointer px-1.5",
                          isMobile ? "h-5 text-[10px]" : "",
                        )}
                      >
                        <Download />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
