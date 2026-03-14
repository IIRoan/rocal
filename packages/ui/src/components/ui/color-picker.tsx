"use client";

import * as React from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../../lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presetColors?: string[];
  className?: string;
}

const DEFAULT_PRESET_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // orange
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#ef4444", // red
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange-500
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
];

export function ColorPicker({
  value,
  onChange,
  presetColors = DEFAULT_PRESET_COLORS,
  className,
}: ColorPickerProps) {
  const [inputValue, setInputValue] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Validate hex color format
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(newValue)) {
      onChange(newValue);
    }
  };

  const handleInputBlur = () => {
    // If the input is not a valid hex color, revert to the current value
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(inputValue)) {
      setInputValue(value);
    }
  };

  const handlePresetClick = (color: string) => {
    setInputValue(color);
    onChange(color);
    setIsOpen(false);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-12 h-10 p-0 border-2"
            style={{ backgroundColor: value }}
          >
            <span className="sr-only">Pick a color</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Custom Color
              </Label>
              <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                placeholder="#000000"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Preset Colors
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "w-8 h-8 rounded border-2 transition-all duration-200 ease-out hover:scale-110 hover:shadow-sm focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none",
                      value === color
                        ? "border-foreground ring-2 ring-ring"
                        : "border-border hover:border-foreground",
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => handlePresetClick(color)}
                    title={color}
                  >
                    <span className="sr-only">{color}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        placeholder="#000000"
        className="font-mono flex-1"
      />
    </div>
  );
}
