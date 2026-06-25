"use client";

import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { useMailComposeClosePrompt } from "./mail-compose-context";

export function ComposeCloseConfirmDialog() {
  const {
    composeClosePromptOpen,
    setComposeClosePromptOpen,
    keepEditing,
    saveDraftAndClose,
    discardAndClose,
  } = useMailComposeClosePrompt();

  return (
    <Dialog
      open={composeClosePromptOpen}
      onOpenChange={(open) => {
        if (open) setComposeClosePromptOpen(true);
      }}
    >
      <DialogContent
        showClose={false}
        className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          keepEditing();
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Save draft?</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Save this message as a draft before closing?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
          <Button variant="outline" size="sm" onClick={keepEditing}>
            Keep editing
          </Button>
          <Button variant="ghost" size="sm" onClick={discardAndClose}>
            Discard
          </Button>
          <Button size="sm" onClick={() => void saveDraftAndClose()}>
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
