"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      gap={8}
      icons={{
        success: <CheckCircle className="h-4 w-4" />,
        error: <XCircle className="h-4 w-4" />,
        warning: <AlertTriangle className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-full items-start gap-3 rounded-lg border border-border/60 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg backdrop-blur-sm",
          title: "font-medium leading-snug",
          description: "text-muted-foreground text-[13px] leading-snug mt-0.5",
          actionButton:
            "inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors",
          cancelButton:
            "inline-flex items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors",
          closeButton:
            "absolute right-2 top-2 rounded-md p-0.5 text-foreground/40 hover:text-foreground/70 transition-opacity",
          success:
            "border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 [&_[data-icon]]:text-emerald-600 dark:[&_[data-icon]]:text-emerald-400",
          error:
            "border-destructive/30 dark:border-destructive/20 bg-destructive/5 dark:bg-destructive/10 text-destructive dark:text-red-200 [&_[data-icon]]:text-destructive",
          warning:
            "border-amber-200/60 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 [&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400",
          info: "border-sky-200/60 dark:border-sky-800/40 bg-sky-50/80 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 [&_[data-icon]]:text-sky-600 dark:[&_[data-icon]]:text-sky-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
