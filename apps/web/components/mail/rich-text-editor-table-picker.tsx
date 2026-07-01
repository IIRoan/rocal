"use client";

import { useState } from "react";
import { cn } from "@workspace/ui/lib/utils";

const TABLE_PICKER_ROWS = 6;
const TABLE_PICKER_COLS = 8;

export function TableSizePicker({
  onPick,
}: {
  onPick: (rows: number, cols: number) => void;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  return (
    <div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 1fr)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLS }).map(
          (_, i) => {
            const r = Math.floor(i / TABLE_PICKER_COLS);
            const c = i % TABLE_PICKER_COLS;
            const active = hover && r <= hover.r && c <= hover.c;
            const sizeLabel = `${r + 1} by ${c + 1} table`;
            return (
              <button
                key={i}
                type="button"
                aria-label={sizeLabel}
                title={sizeLabel}
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => onPick(r + 1, c + 1)}
                className={cn(
                  "size-4 rounded-[2px] border border-border/60 transition-colors",
                  active ? "border-primary bg-primary" : "bg-background hover:bg-muted/60",
                )}
              />
            );
          },
        )}
      </div>
      <div className="mt-1.5 text-center text-xs text-muted-foreground">
        {hover ? `${hover.r + 1} × ${hover.c + 1}` : "Pick size"}
      </div>
    </div>
  );
}
