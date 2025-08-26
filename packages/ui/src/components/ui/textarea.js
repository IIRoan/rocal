import * as React from "react";
import { cn } from "@workspace/ui/lib/utils";
function Textarea({ className, ...props }) {
    return (<textarea data-slot="textarea" className={cn(
        // Base styling matching input component
        "flex min-h-19.5 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-input-foreground shadow-xs transition-[background-color,border-color,box-shadow] outline-none", 
        // Placeholder styling
        "placeholder:text-muted-foreground/70", 
        // Focus states
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50", 
        // Hover states
        "hover:bg-input/80", 
        // Invalid states
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40", 
        // Disabled states
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted", className)} {...props}/>);
}
Textarea.displayName = "Textarea";
export { Textarea };
