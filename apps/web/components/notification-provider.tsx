"use client";

import { createContext, useContext, ReactNode } from "react";

interface NotificationContextType {
  isSupported: boolean;
  permission: NotificationPermission;
  isEnabled: boolean;
  requestPermission: () => Promise<boolean>;
  showTestNotification: () => Promise<boolean>;
  pollForNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  // Provide disabled notification context since browser notifications are removed
  const notifications: NotificationContextType = {
    isSupported: false,
    permission: "denied" as NotificationPermission,
    isEnabled: false,
    requestPermission: async () => false,
    showTestNotification: async () => false,
    pollForNotifications: async () => {},
  };

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  );
}
