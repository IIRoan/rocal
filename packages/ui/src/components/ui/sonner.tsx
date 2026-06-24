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
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto flex w-[var(--width)] items-center gap-3 rounded-md border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "font-medium leading-snug tracking-tight",
          description: "text-sm leading-snug text-muted-foreground",
          icon: "shrink-0",
          actionButton:
            "ml-auto inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          cancelButton:
            "inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent",
          closeButton:
            "absolute right-2 top-2 rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground",
          success:
            "[&_[data-icon]]:text-emerald-600 dark:[&_[data-icon]]:text-emerald-400",
          error: "[&_[data-icon]]:text-destructive",
          warning:
            "[&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400",
          info: "[&_[data-icon]]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
