"use client";

import * as React from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@workspace/ui/lib/utils";
import { isHexColor, PRESET_COLOR_OPTIONS } from "@workspace/calendar-core";

export interface PresetColorOption {
  value: string;
  label: string;
}

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presetColors?: readonly PresetColorOption[];
  className?: string;
}

/**
 * Get CSS variable reference for a named color, or return hex as-is.
 */
function getSwatchBackground(color: string): string {
  if (isHexColor(color)) return color;
  if (color === "blue") return "var(--event-sky)";
  return `var(--event-${color})`;
}

export function ColorPicker({
  value,
  onChange,
  presetColors = PRESET_COLOR_OPTIONS,
  className,
}: ColorPickerProps) {
  const [customHex, setCustomHex] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCustomHex(newValue);

    // Validate hex color format and apply
    if (isHexColor(newValue)) {
      onChange(newValue);
    }
  };

  const handleHexInputBlur = () => {
    // If the input is not a valid hex color, clear it
    if (customHex && !isHexColor(customHex)) {
      setCustomHex("");
    }
  };

  const handlePresetClick = (colorValue: string) => {
    setCustomHex("");
    onChange(colorValue);
    setIsOpen(false);
  };

  // Determine the swatch background for the trigger button
  const triggerBackground = getSwatchBackground(value);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-12 h-10 p-0 border-2"
            style={{ backgroundColor: triggerBackground }}
          >
            <span className="sr-only">Pick a color</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Preset Colors
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {presetColors.map((preset) => (
                  <button
                    key={preset.value}
                    className={cn(
                      "w-8 h-8 rounded border-2 transition-all duration-200 ease-out hover:scale-110 hover:shadow-sm focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none",
                      value === preset.value
                        ? "border-foreground ring-2 ring-ring"
                        : "border-border hover:border-foreground",
                    )}
                    style={{
                      backgroundColor: getSwatchBackground(preset.value),
                    }}
                    onClick={() => handlePresetClick(preset.value)}
                    title={preset.label}
                  >
                    <span className="sr-only">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Custom Color
              </Label>
              <Input
                type="text"
                value={customHex}
                onChange={handleHexInputChange}
                onBlur={handleHexInputBlur}
                placeholder="#000000"
                className="font-mono"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <span className="text-sm text-muted-foreground capitalize">
        {isHexColor(value) ? value : value}
      </span>
    </div>
  );
}
