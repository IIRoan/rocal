"use client";
import { createContext, useContext, useState } from "react";
const CommandPaletteContext = createContext(undefined);
export function useCommandPalette() {
    const context = useContext(CommandPaletteContext);
    if (!context) {
        throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
    }
    return context;
}
export function CommandPaletteProvider({ children, CommandPaletteComponent, }) {
    const [isOpen, setIsOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState(null);
    const [initialView, setInitialView] = useState("main");
    const openPalette = () => {
        setInitialView("main");
        setIsOpen(true);
    };
    const closePalette = () => {
        setIsOpen(false);
        setEventToEdit(null);
        setInitialView("main");
    };
    const openEventEditor = (event) => {
        setEventToEdit(event || null);
        setInitialView("event-editor");
        setIsOpen(true);
    };
    const openCalendarManagement = () => {
        setInitialView("calendars");
        setIsOpen(true);
    };
    const value = {
        isOpen,
        openPalette,
        closePalette,
        openEventEditor,
        openCalendarManagement,
    };
    return (<CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteComponent open={isOpen} onOpenChange={closePalette} eventToEdit={eventToEdit} initialView={initialView} onEventSaved={() => {
            setEventToEdit(null);
        }}/>
    </CommandPaletteContext.Provider>);
}
