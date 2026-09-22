import { ArrowLeft, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerShell,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";

import { EventEditorBody } from "./event-editor-body";
import { EventEditorFooter } from "./event-editor-footer";
import { EventEditorDesktopHeader } from "./event-editor-header";
import { EventEditorPopover } from "./event-editor-popover";
import type { EventEditorViewProps } from "./types";
import { useSaveShortcut } from "./use-save-shortcut";

export function EventEditorView({
  anchorPosition,
  badgeItem,
  calendars,
  dialogTitle,
  eventForm,
  flags,
  handleEventDelete,
  handleEventDownloadIcs,
  handleEventSave,
  handleInvitationResponse,
  invitationResponsePending,
  invitationStatus,
  layout,
  localSettings,
  onBack,
  onOpenChange,
  open,
  recurringModal,
}: EventEditorViewProps) {
  const close = () => onOpenChange(false);
  useSaveShortcut(open && !flags.isViewMode, handleEventSave);
  const embeddedLeadingSlot = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back"
      className="-ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" />
    </button>
  );

  const desktopContent = (
    <>
      <EventEditorDesktopHeader
        badgeItem={badgeItem}
        dialogTitle={dialogTitle}
        leadingSlot={layout === "embedded" ? embeddedLeadingSlot : null}
        onClose={layout === "embedded" ? undefined : close}
      />
      <EventEditorBody
        eventForm={eventForm}
        isViewMode={flags.isViewMode}
        localSettings={localSettings}
        calendars={calendars}
        onSubmit={handleEventSave}
        desktop
      />
      <EventEditorFooter
        canEditEvent={flags.canEdit}
        isViewMode={flags.isViewMode}
        eventForm={eventForm}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
        invitationResponsePending={invitationResponsePending}
        invitationStatus={invitationStatus}
        onInvitationResponse={handleInvitationResponse}
        desktop
        onClose={layout === "embedded" ? onBack : close}
      />
    </>
  );

  if (layout === "mobile") {
    return (
      <>
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          direction="bottom"
          modal={true}
        >
          <DrawerContent
            responsive
            responsiveHeight="92dvh"
            className="rounded-t-[20px] bg-popover border-none flex flex-col gap-0 overflow-hidden pb-0 transition-[max-height,bottom] duration-200 ease-out"
          >
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
            <DrawerShell
              data-testid="mobile-event-editor-shell"
              header={
                <div className="px-4 py-2 flex flex-row items-center gap-1.5 shrink-0">
                  <h2 className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    {dialogTitle}
                    <EncryptionStatusBadge
                      item={badgeItem}
                      hidePlaintext={false}
                      iconSize="sm"
                    />
                  </h2>
                  <DrawerClose className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    <X className="size-5" />
                    <span className="sr-only">Close</span>
                  </DrawerClose>
                </div>
              }
              footer={
                <EventEditorFooter
                  canEditEvent={flags.canEdit}
                  isViewMode={flags.isViewMode}
                  eventForm={eventForm}
                  onBack={onBack}
                  handleEventSave={handleEventSave}
                  handleEventDelete={handleEventDelete}
                  handleEventDownloadIcs={handleEventDownloadIcs}
                  invitationResponsePending={invitationResponsePending}
                  invitationStatus={invitationStatus}
                  onInvitationResponse={handleInvitationResponse}
                />
              }
              bodyClassName="min-h-0"
            >
              <div
                data-testid="mobile-event-editor-main"
                className="flex min-h-0 flex-col overflow-hidden"
              >
                <EventEditorBody
                  eventForm={eventForm}
                  isViewMode={flags.isViewMode}
                  localSettings={localSettings}
                  calendars={calendars}
                  onSubmit={handleEventSave}
                />
              </div>
            </DrawerShell>
          </DrawerContent>
        </Drawer>
        {recurringModal}
      </>
    );
  }

  if (layout === "popover" && anchorPosition) {
    return (
      <EventEditorPopover
        open={open}
        onOpenChange={onOpenChange}
        anchorPosition={anchorPosition}
        ariaLabel={dialogTitle}
        recurringModal={recurringModal}
      >
        {desktopContent}
      </EventEditorPopover>
    );
  }

  if (layout === "embedded") {
    return (
      <>
        {desktopContent}
        {recurringModal}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border shadow-lg rounded-xl w-[460px] max-w-[calc(100vw-2rem)] max-h-[min(750px,calc(100dvh-4rem))] flex flex-col"
      >
        <VisuallyHidden>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </VisuallyHidden>
        {desktopContent}
      </DialogContent>
      {recurringModal}
    </Dialog>
  );
}
