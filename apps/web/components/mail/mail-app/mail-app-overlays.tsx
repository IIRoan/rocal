"use client";

import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Button } from "@workspace/ui/components/ui/button";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import { MailCommandPalette } from "../mail-command-palette";
import { ComposeDialog } from "../compose-dialog";
import { AttachmentPreviewDialog } from "../attachment-preview-dialog";
import type { MailAppContentController } from "../use-mail-app-content-controller";

export function MailAppOverlays({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    isPaletteOpen,
    handlePaletteOpenChange,
    paletteInitialView,
    handleOpenCompose,
    activeMailbox,
    handleCreateMailbox,
    handleDeleteMailbox,
    handleRenameMailbox,
    labels,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
    openMessageById,
    accountEmail,
    handleDismissCompose,
    handleSendMessage,
    handleComposeImageUpload,
    handleExpandCompose,
    isBusy,
    attachmentPreview,
    closeAttachmentPreview,
    emptyFolderOpen,
    patchListChrome,
    emptyFolderLabel,
    selectedMailbox,
    handleEmptyMailbox,
    isOverlayLoading,
  } = controller;

  return (
    <>
      <MailCommandPalette
        open={isPaletteOpen}
        onOpenChange={handlePaletteOpenChange}
        initialView={paletteInitialView}
        onCompose={() => handleOpenCompose()}
        mailboxes={activeMailbox?.mailboxes ?? []}
        onCreateMailbox={(name) => handleCreateMailbox(name)}
        onDeleteMailbox={(id) => handleDeleteMailbox(id)}
        onRenameMailbox={(id, name) => handleRenameMailbox(id, name)}
        labels={labels}
        onCreateLabel={(name, color) => handleCreateLabel(name, color)}
        onUpdateLabel={(id, updates) => void handleUpdateLabel(id, updates)}
        onDeleteLabel={(id) => handleDeleteLabel(id)}
        messages={activeMailbox?.messages ?? []}
        onSelectMessage={(id) => void openMessageById(id)}
      />

      <ComposeDialog
        identities={activeMailbox?.pickerIdentities ?? []}
        fallbackFromEmail={activeMailbox?.email ?? accountEmail}
        onClose={() => void handleDismissCompose()}
        onSend={handleSendMessage}
        onImageUpload={handleComposeImageUpload}
        activeMailbox={
          activeMailbox
            ? {
                client: activeMailbox.client,
                session: activeMailbox.session,
              }
            : null
        }
        onExpand={handleExpandCompose}
        isBusy={isBusy}
      />

      <AttachmentPreviewDialog
        preview={attachmentPreview}
        onOpenChange={(open) => {
          if (!open) {
            closeAttachmentPreview();
          }
        }}
      />

      <Dialog
        open={emptyFolderOpen}
        onOpenChange={(open) => patchListChrome({ emptyFolderOpen: open })}
      >
        <DialogContent
          showClose={false}
          className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>{emptyFolderLabel}?</DialogTitle>
            <DialogDescription>
              Permanently delete all {activeMailbox?.messages.length ?? 0}{" "}
              messages in{" "}
              {selectedMailbox
                ? getMailboxDisplayName(selectedMailbox)
                : "this folder"}
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => patchListChrome({ emptyFolderOpen: false })}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                patchListChrome({ emptyFolderOpen: false });
                void handleEmptyMailbox();
              }}
            >
              {emptyFolderLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageLoadingOverlay
        isLoading={isOverlayLoading}
        messageContext="DATA_SYNC"
        enableCycling
        priority
      />
    </>
  );
}
