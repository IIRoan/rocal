"use client";

import { Plus } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  MAIL_LABEL_PRESET_COLORS,
  resolveLabelDisplayColor,
} from "@workspace/calendar-core";

const DEFAULT_CUSTOM_COLOR = "#6366f1";

function swatchRing(color: string) {
  return { boxShadow: `0 0 0 2px var(--background), 0 0 0 3.5px ${color}` };
}

export function LabelColorPicker({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const selected = resolveLabelDisplayColor(color).toLowerCase();
  const isPreset = MAIL_LABEL_PRESET_COLORS.some(
    (entry) => entry.hex.toLowerCase() === selected,
  );

  return (
    <div role="radiogroup" aria-label="Label color" className="flex flex-wrap items-center gap-2.5 py-1">
      {MAIL_LABEL_PRESET_COLORS.map((entry) => {
        const isSelected = entry.hex.toLowerCase() === selected;
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={entry.label}
            title={entry.label}
            disabled={disabled}
            onClick={() => onChange(entry.hex)}
            className="size-5 cursor-pointer rounded-full transition-shadow disabled:opacity-50"
            style={{
              backgroundColor: entry.hex,
              ...(isSelected ? swatchRing(entry.hex) : {}),
            }}
          />
        );
      })}
      <label
        title="Custom color"
        className={cn(
          "relative flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-shadow",
          isPreset ? "border border-dashed border-muted-foreground/50" : "",
        )}
        style={isPreset ? undefined : { backgroundColor: selected, ...swatchRing(selected) }}
      >
        {isPreset ? <Plus className="size-3" strokeWidth={2.5} /> : null}
        <input
          type="color"
          aria-label="Custom label color"
          value={isPreset ? DEFAULT_CUSTOM_COLOR : selected}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
