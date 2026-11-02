"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

type MailAttachmentPreview =
  | {
      kind: "image";
      name: string;
      type: string;
      url: string;
    }
  | {
      kind: "pdf";
      name: string;
      type: string;
      url: string;
    }
  | {
      kind: "text";
      name: string;
      type: string;
      text: string;
    };

type AttachmentPreviewDialogProps = {
  preview: MailAttachmentPreview | null;
  onOpenChange: (open: boolean) => void;
};

const PDF_DOCUMENT_OPTIONS = {
  isEvalSupported: false,
  enableXfa: false,
};

const PDF_PREVIEW_FAILED =
  "Unable to preview this PDF. Close the preview and download the file to open it in another app.";

let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsModulePromise;
}

function PdfPageCanvas({
  pdfDocument,
  pageNumber,
  scale,
}: {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;

    void pdfDocument
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not render the PDF preview canvas.");
        }

        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdfDocument, scale]);

  if (failed) {
    return (
      <div className="text-muted-foreground flex min-h-64 items-center justify-center rounded-md border border-border/60 bg-background px-6 py-8 text-center text-sm shadow-sm">
        Unable to show page {pageNumber}. Download the file to open it in
        another app.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        // repo-rules-allow theme-tokens-only: PDF pages are white paper documents; the canvas must not follow the theme.
        className="rounded-md border border-border/60 bg-white shadow-sm"
      />
      <div className="text-muted-foreground text-xs">Page {pageNumber}</div>
    </div>
  );
}

export function PdfAttachmentThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    void (async () => {
      const { getDocument } = await loadPdfjs();
      if (cancelled) {
        return;
      }

      loadingTask = getDocument({
        url,
        ...PDF_DOCUMENT_OPTIONS,
      });

      void loadingTask.promise
        .then(async (document) => {
          if (cancelled) {
            return;
          }

          const page = await document.getPage(1);
          const viewport = page.getViewport({ scale: 0.28 });
          const pixelRatio = window.devicePixelRatio || 1;
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Could not render the PDF thumbnail.");
          }

          canvas.width = Math.ceil(viewport.width * pixelRatio);
          canvas.height = Math.ceil(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

          renderTask = page.render({
            canvas,
            canvasContext: context,
            viewport,
          });
          await renderTask.promise;
          await loadingTask?.destroy();
        })
        .catch((thumbnailError) => {
          if (cancelled) {
            return;
          }
          setError(
            thumbnailError instanceof Error
              ? thumbnailError.message
              : "Could not render this PDF preview.",
          );
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    })().catch((loadError) => {
      if (cancelled) {
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not render this PDF preview.",
      );
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [url]);

  return (
    <div className="relative flex min-h-40 w-full items-center justify-center rounded-md border border-border/60 bg-background">
      <canvas
        ref={canvasRef}
        // repo-rules-allow theme-tokens-only: PDF pages are white paper documents; the canvas must not follow the theme.
        className={`mx-auto rounded-md border border-border/60 bg-white shadow-sm ${
          isLoading || error ? "invisible" : ""
        }`}
      />
      {isLoading && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading PDF
        </div>
      )}
      {error && !isLoading && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-3 text-center text-sm">
          PDF preview unavailable
        </div>
      )}
    </div>
  );
}

function PdfAttachmentPreview({
  preview,
}: {
  preview: Extract<MailAttachmentPreview, { kind: "pdf" }>;
}) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const pageCount = pdfDocument?.numPages ?? 0;
  const [scale, setScale] = useState(1.15);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [pdfFailed, setPdfFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    void (async () => {
      const { getDocument } = await loadPdfjs();
      if (cancelled) {
        return;
      }

      loadingTask = getDocument({
        url: preview.url,
        ...PDF_DOCUMENT_OPTIONS,
      });

      void loadingTask.promise
        .then((document) => {
          if (cancelled) {
            return;
          }
          setPdfDocument(document);
        })
        .catch(() => {
          if (!cancelled) {
            setPdfFailed(true);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingDocument(false);
          }
        });
    })().catch(() => {
      if (cancelled) {
        return;
      }
      setPdfFailed(true);
      setIsLoadingDocument(false);
    });

    return () => {
      cancelled = true;
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [preview.url]);

  return (
    <>
      <DialogHeader className="border-b border-border/50 px-4 py-3 pr-12">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="break-words text-base">
              {preview.name}
            </DialogTitle>
            <div className="text-muted-foreground mt-1 text-xs uppercase tracking-wide">
              PDF preview
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md border border-border/60 text-foreground/70 transition-colors hover:bg-hover/50 hover:text-foreground disabled:opacity-40"
              onClick={() =>
                setScale((current) => Math.max(0.6, current - 0.15))
              }
              disabled={isLoadingDocument || !pdfDocument}
              aria-label="Zoom out PDF"
            >
              <Minus className="size-4" strokeWidth={2.25} />
            </button>
            <div className="text-muted-foreground min-w-28 text-center text-xs font-medium tabular-nums">
              {Math.round(scale * 100)}% ·{" "}
              {pageCount === 1 ? "1 page" : `${pageCount || "…"} pages`}
            </div>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md border border-border/60 text-foreground/70 transition-colors hover:bg-hover/50 hover:text-foreground disabled:opacity-40"
              onClick={() =>
                setScale((current) => Math.min(2.4, current + 0.15))
              }
              disabled={isLoadingDocument || !pdfDocument}
              aria-label="Zoom in PDF"
            >
              <Plus className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </DialogHeader>

      <div className="bg-muted/20 min-h-0 flex-1 overflow-auto overscroll-contain p-4">
        {isLoadingDocument ? (
          <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center gap-2 rounded-lg border border-border/60 bg-background text-sm shadow-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading PDF preview
          </div>
        ) : pdfFailed ? (
          <div className="text-muted-foreground flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-background px-6 py-8 text-center shadow-sm">
            <FileText className="size-6" aria-hidden />
            <p className="max-w-md text-sm">{PDF_PREVIEW_FAILED}</p>
          </div>
        ) : pdfDocument ? (
          <div className="flex flex-col items-center gap-5">
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPageCanvas
                key={`${index + 1}-${scale}`}
                pdfDocument={pdfDocument}
                pageNumber={index + 1}
                scale={scale}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function TextAttachmentPreview({
  preview,
}: {
  preview: Extract<MailAttachmentPreview, { kind: "text" }>;
}) {
  return (
    <>
      <DialogHeader className="border-b border-border/50 px-4 py-3 pr-12">
        <div className="min-w-0">
          <DialogTitle className="break-words text-base">
            {preview.name}
          </DialogTitle>
          <div className="text-muted-foreground mt-1 text-xs uppercase tracking-wide">
            Text preview
          </div>
        </div>
      </DialogHeader>
      <div className="bg-muted/20 min-h-0 flex-1 overflow-auto overscroll-contain p-4">
        <pre className="min-h-full whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-background px-4 py-3 font-mono text-sm leading-6 shadow-sm">
          {preview.text}
        </pre>
      </div>
    </>
  );
}

function ImageAttachmentPreview({
  preview,
}: {
  preview: Extract<MailAttachmentPreview, { kind: "image" }>;
}) {
  return (
    <>
      <DialogHeader className="border-b border-border/50 px-4 py-3 pr-12">
        <div className="min-w-0">
          <DialogTitle className="break-words text-base">
            {preview.name}
          </DialogTitle>
          <div className="text-muted-foreground mt-1 text-xs uppercase tracking-wide">
            Image preview
          </div>
        </div>
      </DialogHeader>
      <div className="bg-muted/20 flex min-h-0 flex-1 items-center justify-center overflow-auto overscroll-contain p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.url}
          alt={preview.name}
          className="max-h-full max-w-full rounded-md border border-border/60 bg-background object-contain shadow-sm"
        />
      </div>
    </>
  );
}

export function AttachmentPreviewDialog({
  preview,
  onOpenChange,
}: AttachmentPreviewDialogProps) {
  const open = preview !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(92dvh,900px)] w-[min(96dvw,1100px)] max-w-[96dvw] flex-col p-0"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        {preview?.kind === "pdf" ? (
          <PdfAttachmentPreview key={preview.url} preview={preview} />
        ) : preview?.kind === "text" ? (
          <TextAttachmentPreview preview={preview} />
        ) : preview?.kind === "image" ? (
          <ImageAttachmentPreview preview={preview} />
        ) : (
          <DialogTitle className="sr-only">Attachment preview</DialogTitle>
        )}
      </DialogContent>
    </Dialog>
  );
}
