import { createContext, use, useEffect, type ReactNode } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { afterPaint } from "@workspace/calendar-core";
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
    const transition = () => runSelectionTransition(progress, active);
    // Leaving selection mode is an exit, so only entering waits for the selection chrome to paint.
    return active ? afterPaint(transition) : transition();
  }, [active, progress]);

  return (
    <MailSelectionAnimContext.Provider value={progress}>
      {children}
    </MailSelectionAnimContext.Provider>
  );
}

export function useSelectionProgress(): SharedValue<number> {
  const progress = use(MailSelectionAnimContext);
  if (!progress) {
    throw new Error(
      "useSelectionProgress must be used within MailSelectionAnimProvider",
    );
  }
  return progress;
}
