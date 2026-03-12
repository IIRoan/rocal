"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";

export type EventEditorMode = "modal" | "popover";

export interface EventEditorOptions {
  mode?: EventEditorMode;
  anchorPosition?: { x: number; y: number };
}

interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  openEventEditor: (event?: CalendarEvent, options?: EventEditorOptions) => void;
  openCalendarManagement: () => void;
  eventEditorMode: EventEditorMode;
  popoverAnchorPosition: { x: number; y: number } | null;
}

const CommandPaletteContext = createContext<
  CommandPaletteContextType | undefined
>(undefined);

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return context;
}

interface CommandPaletteProviderProps {
  children: ReactNode;
  CommandPaletteComponent: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventToEdit?: CalendarEvent | null;
    onEventSaved?: () => void;
    initialView?: string;
    eventEditorMode?: EventEditorMode;
    popoverAnchorPosition?: { x: number; y: number } | null;
  }>;
}

export function CommandPaletteProvider({
  children,
  CommandPaletteComponent,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [initialView, setInitialView] = useState<string>("main");
  const [eventEditorMode, setEventEditorMode] = useState<EventEditorMode>("modal");
  const [popoverAnchorPosition, setPopoverAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  const openPalette = () => {
    setInitialView("main");
    setIsOpen(true);
  };

  const closePalette = () => {
    setIsOpen(false);
    setEventToEdit(null);
    setInitialView("main");
    setEventEditorMode("modal");
    setPopoverAnchorPosition(null);
  };

  const openEventEditor = (event?: CalendarEvent, options?: EventEditorOptions) => {
    setEventToEdit(event || null);
    setEventEditorMode(options?.mode || "modal");
    setPopoverAnchorPosition(options?.anchorPosition || null);
    setInitialView("event-editor");
    setIsOpen(true);
  };

  const openCalendarManagement = () => {
    setInitialView("calendars");
    setIsOpen(true);
  };

  const value: CommandPaletteContextType = {
    isOpen,
    openPalette,
    closePalette,
    openEventEditor,
    openCalendarManagement,
    eventEditorMode,
    popoverAnchorPosition,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteComponent
        open={isOpen}
        onOpenChange={closePalette}
        eventToEdit={eventToEdit}
        initialView={initialView}
        eventEditorMode={eventEditorMode}
        popoverAnchorPosition={popoverAnchorPosition}
        onEventSaved={() => {
          setEventToEdit(null);
        }}
      />
    </CommandPaletteContext.Provider>
  );
}
