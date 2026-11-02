"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Button } from "@workspace/ui/components/ui/button";
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
      <DialogContent className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-md">
        <DialogHeader className="pr-12">
          <DialogTitle>Search your full history on this device?</DialogTitle>
          <DialogDescription>
            Solace can keep encrypted titles of your mail and events, and the
            start of each message, on this device so older items stay
            searchable. The index never leaves the device, and encrypted event
            bodies stay encrypted on the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => privateSearchIndex.decline()}>
            Not now
          </Button>
          <Button onClick={() => privateSearchIndex.accept()}>
            Enable on this device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
