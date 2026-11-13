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
          <DialogTitle>Enable on-device search?</DialogTitle>
          <DialogDescription>
            This is off until you choose to enable it. Solace keeps an encrypted
            index on this device. Mail search covers only indexed messages and
            excerpts. The index and private search
            words stay on this device.
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
