import { EncryptionStatusBadge } from "@workspace/ui/components/calendar";

import { EventEditorFieldToggles } from "./event-editor-field-toggles";
import type { EventEditorDesktopHeaderProps } from "./types";

export function EventEditorDesktopHeader({
  badgeItem,
  dialogTitle,
  isRecurring,
  isViewMode,
  leadingSlot,
  onToggleDescription,
  onToggleLocation,
  onToggleNotifications,
  onToggleRecurring,
  showDescription,
  showLocation,
  showNotifications,
}: EventEditorDesktopHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
      {leadingSlot}
      <span className="inline-flex items-center h-5 text-sm font-medium leading-none">
        {dialogTitle}
      </span>
      <EncryptionStatusBadge
        item={badgeItem}
        className="ml-1"
        hidePlaintext={false}
        iconSize="sm"
      />
      <div className="flex-1" />
      {!isViewMode && (
        <EventEditorFieldToggles
          isRecurring={isRecurring}
          onToggleDescription={onToggleDescription}
          onToggleLocation={onToggleLocation}
          onToggleNotifications={onToggleNotifications}
          onToggleRecurring={onToggleRecurring}
          showDescription={showDescription}
          showLocation={showLocation}
          showNotifications={showNotifications}
        />
      )}
    </div>
  );
}
