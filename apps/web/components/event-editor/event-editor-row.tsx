import type { ComponentType, ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

export function EventEditorRow({
  children,
  desktop,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  desktop?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        title={label}
        className={cn(
          "flex w-5 shrink-0 items-center justify-center text-muted-foreground",
          desktop ? "h-9" : "h-11",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
