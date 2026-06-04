import { createContext, useContext, useEffect, type ReactNode } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { runSelectionTransition } from "./mail-selection-anim-utils";

const MailSelectionAnimContext = createContext<SharedValue<number> | null>(
  null,
);

export function MailSelectionAnimProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    runSelectionTransition(progress, active);
  }, [active, progress]);

  return (
    <MailSelectionAnimContext.Provider value={progress}>
      {children}
    </MailSelectionAnimContext.Provider>
  );
}

export function useSelectionProgress(): SharedValue<number> {
  const progress = useContext(MailSelectionAnimContext);
  if (!progress) {
    throw new Error(
      "useSelectionProgress must be used within MailSelectionAnimProvider",
    );
  }
  return progress;
}
