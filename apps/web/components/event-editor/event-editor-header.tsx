import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";
import { X } from "lucide-react";

import type { EventEditorDesktopHeaderProps } from "./types";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

export function EventEditorDesktopHeader({
  badgeItem,
  dialogTitle,
  leadingSlot,
  onClose,
}: EventEditorDesktopHeaderProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 pl-3 pr-2">
      {leadingSlot}
      <span className="text-xs font-medium text-muted-foreground">
        {dialogTitle}
      </span>
      <EncryptionStatusBadge
        item={badgeItem}
        hidePlaintext={false}
        iconSize="sm"
      />
      {onClose && (
        <SimpleTooltip content="Close (Esc)">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
        </SimpleTooltip>
      )}
    </div>
  );
}
