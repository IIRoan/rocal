"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { usePrivateSearchIndexControls } from "@/hooks/use-private-search-index-controls";

export function PrivateSearchIndexPrompt({
  open,
  query,
}: {
  open: boolean;
  query: string;
}) {
  const privateSearchIndex = usePrivateSearchIndexControls();
  const visible =
    open &&
    query.trim().length >= 2 &&
    privateSearchIndex.consent === "undecided";

  return (
    <Dialog
      open={visible}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && privateSearchIndex.consent === "undecided") {
          privateSearchIndex.decline();
        }
      }}
    >
      <DialogContent className="w-[calc(100dvw-1rem)] p-6 pr-12 sm:w-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search your full history on this device?</DialogTitle>
          <DialogDescription>
            Solace can keep an encrypted title index on this device so older
            mail and events stay searchable. Titles never leave the device, and
            encrypted event bodies stay encrypted on the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => privateSearchIndex.decline()}
            className="cursor-pointer rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => privateSearchIndex.accept()}
            className="cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Enable on this device
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
