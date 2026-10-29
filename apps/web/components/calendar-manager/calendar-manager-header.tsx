import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function CalendarManagerHeader({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="p-1 rounded hover:bg-muted/50 transition-colors"
      >
        <ArrowLeft className="size-4 text-muted-foreground" />
      </button>
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}
