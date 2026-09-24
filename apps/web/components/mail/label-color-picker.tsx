"use client";

import { Plus } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  MAIL_LABEL_CUSTOM_DEFAULT_COLOR,
  MAIL_LABEL_PRESET_COLORS,
  resolveLabelDisplayColor,
} from "@workspace/calendar-core";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

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
          <SimpleTooltip content={entry.label} key={entry.value}>
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={entry.label}
              disabled={disabled}
              onClick={() => onChange(entry.hex)}
              className="size-5 cursor-pointer rounded-full transition-shadow disabled:opacity-50"
              style={{
                backgroundColor: entry.hex,
                ...(isSelected ? swatchRing(entry.hex) : {}),
              }}
            />
          </SimpleTooltip>
        );
      })}
      <SimpleTooltip content="Custom color">
        <label
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
            value={isPreset ? MAIL_LABEL_CUSTOM_DEFAULT_COLOR : selected}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </SimpleTooltip>
    </div>
  );
}
