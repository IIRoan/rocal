import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EventSheet,
  type EventSheetMode,
} from "../components/event/EventSheet";

interface SheetContextValue {
  openEventSheet: (mode: EventSheetMode) => void;
  closeEventSheet: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<EventSheetMode | null>(null);
  const [presentKey, setPresentKey] = useState(0);
  // Updated with the state, not in an effect: the sheet can report close-complete in the same commit as a reopen.
  const visibleRef = useRef(visible);

  const openEventSheet = useCallback((m: EventSheetMode) => {
    visibleRef.current = true;
    setMode(m);
    setVisible(true);
    setPresentKey((key) => key + 1);
  }, []);

  const closeEventSheet = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const handleSheetCloseComplete = useCallback(() => {
    if (!visibleRef.current) {
      setMode(null);
    }
  }, []);

  // A fresh value on every open/close would re-render every consumer, including the whole calendar screen.
  const contextValue = useMemo(
    () => ({ openEventSheet, closeEventSheet }),
    [openEventSheet, closeEventSheet],
  );

  return (
    <SheetContext.Provider value={contextValue}>
      {children}
      <EventSheet
        visible={visible}
        mode={mode}
        presentKey={presentKey}
        onDismiss={closeEventSheet}
        onCloseComplete={handleSheetCloseComplete}
      />
    </SheetContext.Provider>
  );
}

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    throw new Error("useSheet must be used within a SheetProvider");
  }
  return ctx;
}
