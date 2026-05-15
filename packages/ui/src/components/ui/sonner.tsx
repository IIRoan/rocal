"use client";

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
            "group flex w-full items-start gap-x-3 rounded-md border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg",
          title: "font-medium tracking-tight",
          description: "text-muted-foreground text-sm mt-0.5",
          actionButton:
            "inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors",
          cancelButton:
            "inline-flex items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors",
          closeButton:
            "absolute right-2 top-2 rounded-md p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors",
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
