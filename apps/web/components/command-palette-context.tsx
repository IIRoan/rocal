"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  startTransition,
} from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

export type EventEditorMode = "modal" | "popover";

export interface EventEditorOptions {
  mode?: EventEditorMode;
  anchorPosition?: { x: number; y: number };
  eventViewMode?: "view" | "edit";
}

interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  openSearchPalette: () => void;
  closePalette: () => void;
  openEventEditor: (
    event?: CalendarEvent,
    options?: EventEditorOptions,
  ) => void;
  openCalendarManagement: () => void;
  eventEditorMode: EventEditorMode;
  popoverAnchorPosition: { x: number; y: number } | null;
  previewEvent: CalendarEvent | null;
  updatePreviewEvent: (updates: Partial<CalendarEvent>) => void;
  clearPreviewEvent: () => void;
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
    onEventEdit?: (event: CalendarEvent) => void;
    initialView?: string;
    eventEditorMode?: EventEditorMode;
    popoverAnchorPosition?: { x: number; y: number } | null;
    initialEventViewMode?: "view" | "edit";
    previewEvent?: CalendarEvent | null;
    updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
  }>;
}

export function CommandPaletteProvider({
  children,
  CommandPaletteComponent,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [initialView, setInitialView] = useState<string>("main");
  const [eventEditorMode, setEventEditorMode] =
    useState<EventEditorMode>("modal");
  const [popoverAnchorPosition, setPopoverAnchorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [initialEventViewMode, setInitialEventViewMode] = useState<
    "view" | "edit"
  >("view");
  const [previewEvent, setPreviewEvent] = useState<CalendarEvent | null>(null);

  const openSearchPalette = () => {
    setInitialView("search");
    setIsOpen(true);
  };

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
    setInitialEventViewMode("view");
    setPreviewEvent(null);
  };

  const openEventEditor = (
    event?: CalendarEvent,
    options?: EventEditorOptions,
  ) => {
    setEventToEdit(event || null);
    setEventEditorMode(options?.mode || "modal");
    setPopoverAnchorPosition(options?.anchorPosition || null);
    setInitialEventViewMode(options?.eventViewMode || "view");
    // Create preview event for popover mode (timeline clicks)
    if (options?.mode === "popover" && event) {
      startTransition(() => {
        setPreviewEvent({ ...event, isPreview: true });
      });
    } else {
      setPreviewEvent(null);
    }
    setInitialView("event-editor");
    setIsOpen(true);
  };

  const updatePreviewEvent = (updates: Partial<CalendarEvent>) => {
    startTransition(() => {
      setPreviewEvent((prev) => (prev ? { ...prev, ...updates } : null));
    });
  };

  const clearPreviewEvent = () => {
    setPreviewEvent(null);
  };

  const openCalendarManagement = () => {
    setInitialView("calendars");
    setIsOpen(true);
  };

  const value: CommandPaletteContextType = {
    isOpen,
    openPalette,
    openSearchPalette,
    closePalette,
    openEventEditor,
    openCalendarManagement,
    eventEditorMode,
    popoverAnchorPosition,
    previewEvent,
    updatePreviewEvent,
    clearPreviewEvent,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteComponent
        open={isOpen}
        onOpenChange={closePalette}
        eventToEdit={eventToEdit}
        onEventEdit={(event) => openEventEditor(event, { eventViewMode: "view" })}
        initialView={initialView}
        eventEditorMode={eventEditorMode}
        popoverAnchorPosition={popoverAnchorPosition}
        initialEventViewMode={initialEventViewMode}
        previewEvent={previewEvent}
        updatePreviewEvent={updatePreviewEvent}
        onEventSaved={() => {
          setEventToEdit(null);
          setPreviewEvent(null);
        }}
      />
    </CommandPaletteContext.Provider>
  );
}

