import { cn } from "@workspace/ui/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Filled pill for pickers and menus (date/time/repeat chips). */
export function chipClass(desktop?: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-accent/60 px-2.5 text-sm font-normal text-foreground shadow-none transition-colors cursor-pointer",
    "hover:bg-accent data-[state=open]:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90",
    FOCUS_RING,
    desktop ? "h-8" : "h-11",
  );
}

/** Filled text field with a visible resting background so empty fields stay findable. */
export function fieldClass(desktop?: boolean) {
  return cn(
    "w-full rounded-md border-0 bg-accent/40 px-3 text-sm text-foreground shadow-none transition-colors",
    "placeholder:text-muted-foreground hover:bg-accent/60 focus-visible:bg-accent/60",
    FOCUS_RING,
    desktop ? "h-9" : "h-11",
  );
}
