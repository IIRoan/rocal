"use client";

import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { EventEditor } from "../event-editor";
import { TransitionContainer } from "./transition-container";
import { CommandPaletteViewContent } from "./command-palette-view-content";
import { CommandPaletteDesktopDialog } from "./command-palette-desktop-dialog";
import { PrivateSearchIndexPrompt } from "./private-search-index-prompt";
import { useCommandPaletteController } from "./use-command-palette-controller";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Loader2 } from "lucide-react";
import type { EventEditorMode } from "../command-palette-context";

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  onEventEdit?: (event: CalendarEvent) => void;
  initialView?: string;
  initialSearchQuery?: string;
  eventEditorMode?: EventEditorMode;
  popoverAnchorPosition?: { x: number; y: number } | null;
  initialEventViewMode?: "view" | "edit";
  previewEvent?: CalendarEvent | null;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
};

function CommandPaletteLoadingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl"
      >
        <VisuallyHidden>
          <DialogTitle>Loading Settings</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <Loader2 className="size-6 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteShortcutsFooter() {
  return (
    <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between shrink-0">
      <span>
        Type{" "}
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
          &gt;
        </kbd>{" "}
        for commands
      </span>
      <span className="hidden sm:flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
          ↑↓
        </kbd>{" "}
        to navigate
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
          ↵
        </kbd>{" "}
        to select
      </span>
    </div>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  onEventEdit,
  initialView = "main",
  initialSearchQuery = "",
  eventEditorMode = "modal",
  popoverAnchorPosition = null,
  initialEventViewMode = "view",
  updatePreviewEvent,
}: CommandPaletteProps) {
  const c = useCommandPaletteController({
    open,
    onOpenChange,
    onEventEdit,
    initialView,
    initialSearchQuery,
  });

  if (c.loading || !c.localSettings) {
    return (
      <CommandPaletteLoadingDialog open={open} onOpenChange={onOpenChange} />
    );
  }

  if (c.currentView === "event-editor") {
    return (
      <EventEditor
        open={open}
        onOpenChange={onOpenChange}
        eventToEdit={eventToEdit}
        onEventSaved={onEventSaved}
        onBack={() => onOpenChange(false)}
        localSettings={c.localSettings}
        editorMode={eventEditorMode}
        anchorPosition={popoverAnchorPosition}
        initialEventViewMode={initialEventViewMode}
        updatePreviewEvent={updatePreviewEvent}
      />
    );
  }

  const paletteContent = (
    <>
      <TransitionContainer viewKey={c.currentView}>
        <CommandPaletteViewContent
          open={open}
          onOpenChange={onOpenChange}
          currentView={c.currentView}
          localSettings={c.localSettings}
          updateSetting={c.updateSetting}
          goBack={c.goBack}
          goForward={c.goForward}
          paletteSearch={c.paletteSearch}
          saving={c.busy.saving}
          handleReset={c.handleReset}
          deletingAccount={c.busy.deletingAccount}
          handleDeleteAccount={c.handleDeleteAccount}
          accountName={c.session?.user?.name}
          accountEmail={c.session?.user?.email}
          accountImage={c.accountImage}
          sessionLoading={c.sessionLoading}
          changingPassword={c.busy.changingPassword}
          settingPassword={c.busy.settingPassword}
          resettingEncryptionPassword={c.busy.resettingEncryptionPassword}
          hasPasswordAccount={c.hasPasswordAccount}
          hasOAuthAccount={c.hasOAuthAccount}
          handleChangePassword={c.handleChangePassword}
          handleSetPassword={c.handleSetPassword}
          handleResetEncryptionPassword={c.handleResetEncryptionPassword}
          updatingProfile={c.busy.updatingProfile}
          handleUpdateProfile={c.handleUpdateProfile}
          passkeyAddMode={c.chrome.passkeyAddMode}
          setSubscriptionEditCalendarId={c.setSubscriptionEditCalendarId}
          activeSubscriptionEditCalendarId={c.activeSubscriptionEditCalendarId}
          onEventSaved={onEventSaved}
          eventEditorMode={eventEditorMode}
          popoverAnchorPosition={popoverAnchorPosition}
          updatePreviewEvent={updatePreviewEvent}
          calendars={c.calendars}
        />
      </TransitionContainer>
      {c.currentView !== "events" && !c.isMobile && (
        <CommandPaletteShortcutsFooter />
      )}
    </>
  );

  if (c.isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
          <DrawerContent
            responsive
            responsiveHeight="90svh"
            className="bg-popover border-border/50 flex flex-col overflow-hidden p-0"
          >
            <VisuallyHidden>
              <DrawerTitle>{c.title}</DrawerTitle>
            </VisuallyHidden>
            {paletteContent}
          </DrawerContent>
        </Drawer>
        <PrivateSearchIndexPrompt
          open={open}
          query={c.paletteSearch.searchQuery}
        />
      </>
    );
  }

  return (
    <>
      <CommandPaletteDesktopDialog
        open={open}
        onOpenChange={onOpenChange}
        title={c.title}
        hasBothResults={c.hasBothResults}
      >
        {paletteContent}
      </CommandPaletteDesktopDialog>
      <PrivateSearchIndexPrompt
        open={open}
        query={c.paletteSearch.searchQuery}
      />
    </>
  );
}
