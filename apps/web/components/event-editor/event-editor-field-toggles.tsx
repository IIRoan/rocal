import type { ComponentType } from "react";
import { Bell, FileText, MapPin, RotateCcw } from "lucide-react";

type EventEditorFieldTogglesProps = {
  className?: string;
  isRecurring: boolean;
  onToggleDescription: () => void;
  onToggleLocation: () => void;
  onToggleNotifications: () => void;
  onToggleRecurring: () => void;
  showDescription: boolean;
  showLocation: boolean;
  showNotifications: boolean;
};

function EventEditorFieldToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded transition-colors cursor-pointer ${
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
      title={label}
      aria-label={label}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function EventEditorFieldToggles({
  className = "flex items-center gap-1",
  isRecurring,
  onToggleDescription,
  onToggleLocation,
  onToggleNotifications,
  onToggleRecurring,
  showDescription,
  showLocation,
  showNotifications,
}: EventEditorFieldTogglesProps) {
  return (
    <div className={className}>
      <EventEditorFieldToggleButton
        active={showLocation}
        icon={MapPin}
        label="Location"
        onClick={onToggleLocation}
      />
      <EventEditorFieldToggleButton
        active={showDescription}
        icon={FileText}
        label="Description"
        onClick={onToggleDescription}
      />
      <EventEditorFieldToggleButton
        active={isRecurring}
        icon={RotateCcw}
        label="Repeat"
        onClick={onToggleRecurring}
      />
      <EventEditorFieldToggleButton
        active={showNotifications}
        icon={Bell}
        label="Reminder"
        onClick={onToggleNotifications}
      />
    </div>
  );
}
