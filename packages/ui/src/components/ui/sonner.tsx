"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CheckIcon, XIcon, AlertTriangleIcon, InfoIcon } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      gap={8}
      style={{ "--width": "22rem" } as CSSProperties}
      icons={{
        success: <CheckIcon className="size-4 text-current" />,
        error: <XIcon className="size-4 text-current" />,
        warning: <AlertTriangleIcon className="size-4 text-current" />,
        info: <InfoIcon className="size-4 text-current" />,
      }}
      toastOptions={{
        // WCAG 2.2.2: a timed toast stays at least 5s; Sonner pauses it while hovered.
        duration: 5000,
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto flex w-[var(--width)] items-center gap-3 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg has-[[data-close-button]]:pr-11",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "font-medium leading-snug tracking-tight",
          description: "text-sm leading-snug text-muted-foreground",
          icon: "shrink-0",
          actionButton:
            "ml-auto inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90",
          cancelButton:
            "inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover",
          closeButton:
            "absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-accent",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
