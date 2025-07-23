"use client";

import { useState } from "react";
import { useNotifications } from "./notification-provider";
import { Button } from "@workspace/ui/components/ui/button";
import { Bell, CheckCircle, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export function NotificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { isSupported, permission, requestPermission, showTestNotification } =
    useNotifications();

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        // Show a test notification after a brief delay
        setTimeout(() => {
          showTestNotification();
        }, 500);
      }
    } finally {
      setIsEnabling(false);
    }
  };

  // Don't render anything if notifications aren't supported, already granted, denied, or dismissed
  if (
    !isSupported ||
    permission === "granted" ||
    dismissed ||
    permission === "denied"
  ) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto max-w-4xl">
        <div
          className={cn(
            "flex items-center gap-4 rounded-lg border border-border/80 bg-background/95 p-4 shadow-lg backdrop-blur-sm",
            "ring-1 ring-accent/20"
          )}
        >
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
              <Bell className="h-5 w-5 text-accent" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-1">
            <h4 className="text-sm font-medium text-foreground">
              Enable notifications
            </h4>
            <p className="text-sm text-muted-foreground">
              Get reminders for your calendar events and never miss important updates.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={isEnabling}
              className="whitespace-nowrap"
            >
              {isEnabling ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Enabling...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Enable
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="h-9 w-9 p-0"
              aria-label="Dismiss notification banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}