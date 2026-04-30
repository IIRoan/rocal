import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  EventSheet,
  type EventSheetMode,
} from "../components/event/EventSheet";

// ─── Context ─────────────────────────────────────────────────────────────────

interface SheetContextValue {
  openEventSheet: (mode: EventSheetMode) => void;
  closeEventSheet: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function SheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<EventSheetMode | null>(null);

  const openEventSheet = useCallback((m: EventSheetMode) => {
    setMode(m);
    setVisible(true);
  }, []);

  const closeEventSheet = useCallback(() => {
    setVisible(false);
    setMode(null);
  }, []);

  return (
    <SheetContext.Provider value={{ openEventSheet, closeEventSheet }}>
      {children}
      <EventSheet visible={visible} mode={mode} onDismiss={closeEventSheet} />
    </SheetContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    throw new Error("useSheet must be used within a SheetProvider");
  }
  return ctx;
}
