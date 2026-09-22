import type { ComponentType } from "react";

import { cn } from "@workspace/ui/lib/utils";

import {
  PaletteIconBox,
} from "./palette-ui";
import { PALETTE_ROW_CLASS } from "./palette-styles";

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
        "inline-flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-out",
        checked ? "bg-foreground" : "bg-muted-foreground/25",
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-3" : "translate-x-0",
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
      className={PALETTE_ROW_CLASS}
    >
      <PaletteIconBox>
        <Icon className="size-4" />
      </PaletteIconBox>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-[130%] text-foreground">{label}</div>
        <div className="text-[13px] leading-[130%] text-muted-foreground">
          {description}
        </div>
      </div>
      <ToggleIndicator checked={checked} />
    </button>
  );
}
