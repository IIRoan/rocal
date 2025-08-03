"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";

interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  openEventEditor: (event?: CalendarEvent) => void;
  openCalendarManagement: () => void;
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
  }>;
}

export function CommandPaletteProvider({
  children,
  CommandPaletteComponent,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);
  const [initialView, setInitialView] = useState<string>("main");

  const openPalette = () => {
    setInitialView("main");
    setIsOpen(true);
  };

  const closePalette = () => {
    setIsOpen(false);
    setEventToEdit(null);
    setInitialView("main");
  };

  const openEventEditor = (event?: CalendarEvent) => {
    setEventToEdit(event || null);
    setInitialView("main");
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
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteComponent
        open={isOpen}
        onOpenChange={closePalette}
        eventToEdit={eventToEdit}
        initialView={initialView}
        onEventSaved={() => {
          setEventToEdit(null);
        }}
      />
    </CommandPaletteContext.Provider>
  );
}
