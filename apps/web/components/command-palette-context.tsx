"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";

interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  openEventEditor: (event?: CalendarEvent) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | undefined>(undefined);

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
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
  }>;
  onEventSaved?: () => void;
}

export function CommandPaletteProvider({ 
  children, 
  CommandPaletteComponent,
  onEventSaved 
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<CalendarEvent | null>(null);

  const openPalette = () => setIsOpen(true);
  const closePalette = () => {
    setIsOpen(false);
    setEventToEdit(null);
  };
  
  const openEventEditor = (event?: CalendarEvent) => {
    setEventToEdit(event || null);
    setIsOpen(true);
  };

  const value: CommandPaletteContextType = {
    isOpen,
    openPalette,
    closePalette,
    openEventEditor,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteComponent
        open={isOpen}
        onOpenChange={closePalette}
        eventToEdit={eventToEdit}
        onEventSaved={() => {
          onEventSaved?.();
          setEventToEdit(null);
        }}
      />
    </CommandPaletteContext.Provider>
  );
}