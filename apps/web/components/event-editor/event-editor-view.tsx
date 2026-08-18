import { ArrowLeft, Plus, X } from "lucide-react";
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
  handleToggleDescription,
  handleToggleLocation,
  handleToggleNotifications,
  handleToggleParticipants,
  handleToggleRecurring,
  invitationResponsePending,
  invitationStatus,
  layout,
  localSettings,
  onBack,
  onOpenChange,
  open,
  recurringModal,
  setShowDescription,
  setShowLocation,
  setShowParticipants,
  visibleSections,
}: EventEditorViewProps) {
  const selectedEvent = eventForm.selectedEvent;
  const standardLeadingSlot = selectedEvent?.id ? (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      aria-label="Back"
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="size-4 text-muted-foreground" />
    </button>
  ) : (
    <Plus className="size-4 text-muted-foreground ml-1" />
  );
  const embeddedLeadingSlot = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back"
      className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <ArrowLeft className="size-4 text-muted-foreground" />
    </button>
  );

  const desktopContent = (
    <>
      <EventEditorDesktopHeader
        badgeItem={badgeItem}
        dialogTitle={dialogTitle}
        isRecurring={flags.isRecurring}
        isViewMode={flags.isViewMode}
        leadingSlot={
          layout === "embedded" ? embeddedLeadingSlot : standardLeadingSlot
        }
        onToggleDescription={handleToggleDescription}
        onToggleLocation={handleToggleLocation}
        onToggleNotifications={handleToggleNotifications}
        onToggleParticipants={handleToggleParticipants}
        onToggleRecurring={handleToggleRecurring}
        showDescription={visibleSections.description}
        showLocation={visibleSections.location}
        showNotifications={visibleSections.notifications}
        showParticipants={visibleSections.participants}
      />
      <EventEditorBody
        eventForm={eventForm}
        isViewMode={flags.isViewMode}
        visibleSections={visibleSections}
        setShowLocation={setShowLocation}
        setShowDescription={setShowDescription}
        setShowParticipants={setShowParticipants}
        localSettings={localSettings}
        calendars={calendars}
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
        onClose={() => onOpenChange(false)}
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
            className="rounded-t-[20px] bg-card/95 backdrop-blur-xl border-none flex flex-col gap-0 overflow-hidden pb-0 transition-[max-height,bottom] duration-200 ease-out"
          >
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
            <DrawerShell
              data-testid="mobile-event-editor-shell"
              header={
                <div className="px-5 py-3 border-b border-border/40 flex flex-row items-center gap-2 shrink-0">
                  <h2 className="inline-flex min-w-0 flex-1 items-center h-5 text-base font-semibold leading-none">
                    {dialogTitle}
                    <EncryptionStatusBadge
                      item={badgeItem}
                      className="ml-1"
                      hidePlaintext={false}
                      iconSize="sm"
                    />
                  </h2>
                  <DrawerClose className="flex size-10 shrink-0 items-center justify-center rounded-md text-foreground opacity-70 transition-opacity hover:opacity-100">
                    <X size={20} />
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
                  visibleSections={visibleSections}
                  setShowLocation={setShowLocation}
                  setShowDescription={setShowDescription}
                  setShowParticipants={setShowParticipants}
                  localSettings={localSettings}
                  calendars={calendars}
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
        badgeItem={badgeItem}
        calendars={calendars}
        dialogTitle={dialogTitle}
        eventForm={eventForm}
        handleEventSave={handleEventSave}
        handleEventDelete={handleEventDelete}
        handleEventDownloadIcs={handleEventDownloadIcs}
        flags={flags}
        invitationResponsePending={invitationResponsePending}
        invitationStatus={invitationStatus}
        leadingSlot={standardLeadingSlot}
        localSettings={localSettings}
        onInvitationResponse={handleInvitationResponse}
        recurringModal={recurringModal}
        setShowLocation={setShowLocation}
        setShowDescription={setShowDescription}
        setShowParticipants={setShowParticipants}
        visibleSections={visibleSections}
      />
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
        className="overflow-hidden p-0 bg-popover border-border shadow-xl min-w-[420px] max-h-[750px] flex flex-col"
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
