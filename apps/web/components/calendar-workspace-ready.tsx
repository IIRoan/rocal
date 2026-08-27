"use client";

import { createContext, use, useState, type ReactNode } from "react";

type CalendarWorkspaceReadyContextValue = {
  isReady: boolean;
  markReady: () => void;
};

const CalendarWorkspaceReadyContext =
  createContext<CalendarWorkspaceReadyContextValue | null>(null);

export function CalendarWorkspaceReadyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);

  return (
    <CalendarWorkspaceReadyContext.Provider
      value={{
        isReady,
        markReady: () => {
          setIsReady(true);
        },
      }}
    >
      {children}
    </CalendarWorkspaceReadyContext.Provider>
  );
}

export function useCalendarWorkspaceReady() {
  return use(CalendarWorkspaceReadyContext);
}
