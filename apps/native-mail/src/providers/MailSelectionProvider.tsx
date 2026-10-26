import React, {
  createContext,
  useContext,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MailSelectionContextValue {
  /** The id of the mailbox currently being viewed, or null before init. */
  selectedMailboxId: string | null;
  /** Update the selected mailbox. */
  setSelectedMailboxId: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MailSelectionContext = createContext<MailSelectionContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function MailSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    null,
  );

  const value: MailSelectionContextValue = { selectedMailboxId, setSelectedMailboxId };

  return (
    <MailSelectionContext.Provider value={value}>
      {children}
    </MailSelectionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMailSelection(): MailSelectionContextValue {
  const ctx = useContext(MailSelectionContext);
  if (!ctx) {
    throw new Error(
      "useMailSelection must be used within a MailSelectionProvider",
    );
  }
  return ctx;
}
