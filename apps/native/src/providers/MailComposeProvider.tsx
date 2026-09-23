import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ComposeSheet } from "../components/mail/ComposeSheet";
import type { ComposeRequest } from "../lib/mail/compose-request";
import { WorkspaceThemeScope } from "./ThemeProvider";

interface MailComposeContextValue {
  openCompose: (request?: ComposeRequest) => void;
}

const MailComposeContext = createContext<MailComposeContextValue | null>(null);

/** Hosts the compose drawer above the mail list and message screens. */
export function MailComposeProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState<ComposeRequest | null>(null);
  const [presentKey, setPresentKey] = useState(0);
  // Updated with the state, not in an effect: the sheet can report close-complete in the same commit as a reopen.
  const visibleRef = useRef(visible);

  const openCompose = useCallback((next: ComposeRequest = {}) => {
    visibleRef.current = true;
    setRequest(next);
    setVisible(true);
    setPresentKey((key) => key + 1);
  }, []);

  const closeCompose = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const handleCloseComplete = useCallback(() => {
    if (!visibleRef.current) {
      setRequest(null);
    }
  }, []);

  const contextValue = useMemo(() => ({ openCompose }), [openCompose]);

  return (
    <MailComposeContext.Provider value={contextValue}>
      {children}
      <WorkspaceThemeScope>
        <ComposeSheet
          visible={visible}
          request={request}
          presentKey={presentKey}
          onClose={closeCompose}
          onCloseComplete={handleCloseComplete}
        />
      </WorkspaceThemeScope>
    </MailComposeContext.Provider>
  );
}

export function useMailCompose(): MailComposeContextValue {
  const ctx = useContext(MailComposeContext);
  if (!ctx) {
    throw new Error("useMailCompose must be used within a MailComposeProvider");
  }
  return ctx;
}
