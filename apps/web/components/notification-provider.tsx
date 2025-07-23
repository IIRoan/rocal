"use client";

import { createContext, useContext, useEffect, ReactNode } from "react";
import { useBrowserNotifications } from "@/lib/hooks/use-browser-notifications";

interface NotificationContextType {
  isSupported: boolean;
  permission: NotificationPermission;
  isEnabled: boolean;
  requestPermission: () => Promise<boolean>;
  showTestNotification: () => Promise<boolean>;
  pollForNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const notifications = useBrowserNotifications();

  // Log initialization status
  useEffect(() => {
    console.log('NotificationProvider initialized:', {
      isSupported: notifications.isSupported,
      permission: notifications.permission,
      isEnabled: notifications.isEnabled,
    });
  }, [notifications.isSupported, notifications.permission, notifications.isEnabled]);

  return (
    <NotificationContext.Provider value={notifications}>
      {children}
    </NotificationContext.Provider>
  );
}