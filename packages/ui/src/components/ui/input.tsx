import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styling with proper input background
        "flex h-9 w-full min-w-0 rounded-md border border-border bg-input px-3 py-1 text-sm text-input-foreground shadow-xs transition-[background-color,border-color,box-shadow] outline-none",
        // Placeholder styling
        "placeholder:text-muted-foreground/70",
        // Focus states
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        // Hover states
        "hover:bg-input/80",
        // Invalid states
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        // Disabled states
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
        // File input specific styling
        type === "file" &&
          "text-muted-foreground/70 file:border-input file:text-foreground p-0 pr-3 italic file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:bg-transparent file:px-3 file:text-sm file:font-medium file:not-italic",
        // File input file button styling
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        // Search input specific styling
        type === "search" &&
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
