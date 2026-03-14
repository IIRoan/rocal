import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  animated?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "flex h-9 w-full min-w-0 rounded-md bg-input px-3 py-1 text-sm text-input-foreground outline-none",
          "placeholder:text-muted-foreground/70",
          "aria-invalid:bg-destructive/10",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
          type === "file" &&
            "text-muted-foreground/70 file:border-input file:text-foreground p-0 pr-3 italic file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:bg-transparent file:px-3 file:text-sm file:font-medium file:not-italic",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
