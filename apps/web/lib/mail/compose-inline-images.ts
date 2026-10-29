export type ComposeInlineImage = {
  cid: string;
  /** Null for images inserted while composing: they are uploaded only if a plaintext send needs them. */
  blobId: string | null;
  type: string;
  name: string;
  size: number;
  dataUrl: string;
  content: Uint8Array;
};

let composeInlineImages: ComposeInlineImage[] = [];
let pendingQuotedInlineHydrations = 0;
const quotedInlineHydrationWaiters: Array<() => void> = [];

/** Reads an image as a data URL for the editor preview; rejects when the browser cannot read it. */
export function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image preview"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image preview"));
    reader.readAsDataURL(blob);
  });
}

export function resetComposeInlineImages(): void {
  composeInlineImages = [];
  pendingQuotedInlineHydrations = 0;
  quotedInlineHydrationWaiters.splice(0).forEach((resolve) => resolve());
}

export function beginQuotedInlineImageHydration(): void {
  pendingQuotedInlineHydrations += 1;
}

export function completeQuotedInlineImageHydration(): void {
  pendingQuotedInlineHydrations = Math.max(0, pendingQuotedInlineHydrations - 1);
  if (pendingQuotedInlineHydrations === 0) {
    quotedInlineHydrationWaiters.splice(0).forEach((resolve) => resolve());
  }
}

export function waitForQuotedInlineImageHydration(): Promise<void> {
  if (pendingQuotedInlineHydrations === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    quotedInlineHydrationWaiters.push(resolve);
  });
}

export function registerComposeInlineImage(entry: ComposeInlineImage): void {
  composeInlineImages.push(entry);
}

export function getComposeInlineImages(): readonly ComposeInlineImage[] {
  return composeInlineImages;
}
