import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";

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
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft className="size-4 text-muted-foreground" />
      </Button>
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}
