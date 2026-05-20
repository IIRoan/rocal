import type { ComponentType } from "react";

import { cn } from "@workspace/ui/lib/utils";

type SettingToggleRowProps = {
  checked: boolean;
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onToggle: () => void;
};

export function ToggleIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-xs transition-colors duration-200 ease-out",
        checked ? "bg-primary" : "bg-input dark:bg-input/80",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </span>
  );
}

export function SettingToggleRow({
  checked,
  description,
  icon: Icon,
  label,
  onToggle,
}: SettingToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none"
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ToggleIndicator checked={checked} />
    </button>
  );
}
