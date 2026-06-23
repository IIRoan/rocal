export type ComposeInlineImage = {
  cid: string;
  blobId: string;
  type: string;
  name: string;
  size: number;
  dataUrl: string;
  content: Uint8Array;
};

let composeInlineImages: ComposeInlineImage[] = [];
let pendingQuotedInlineHydrations = 0;
const quotedInlineHydrationWaiters: Array<() => void> = [];

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
