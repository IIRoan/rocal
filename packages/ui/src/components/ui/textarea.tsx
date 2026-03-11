import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-19.5 w-full rounded-md bg-input px-3 py-2 text-sm text-input-foreground outline-none",
        "placeholder:text-muted-foreground/70",
        "aria-invalid:bg-destructive/10",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
Textarea.displayName = "Textarea";

export { Textarea };
