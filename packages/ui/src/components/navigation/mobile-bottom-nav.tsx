"use client";

import React from "react";
import {
  Calendar,
  Grid3X3,
  LayoutGrid,
  CalendarDays,
  Columns3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CalendarView } from "../calendar/types";

interface MobileBottomNavProps {
  currentView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  className?: string;
}

const VIEW_OPTIONS: {
  value: CalendarView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { value: "day", label: "Day", shortLabel: "Day", icon: CalendarDays },
  { value: "3day", label: "3 Days", shortLabel: "3 Days", icon: Columns3 },
  { value: "week", label: "Week", shortLabel: "Week", icon: Grid3X3 },
  { value: "month", label: "Month", shortLabel: "Month", icon: Calendar },
  { value: "agenda", label: "Agenda", shortLabel: "List", icon: LayoutGrid },
];

function getViewIcon(view: CalendarView, size = 20) {
  const option = VIEW_OPTIONS.find((opt) => opt.value === view);
  const Icon = option?.icon || Calendar;
  return <Icon size={size} />;
}

export function MobileBottomNav({
  currentView = "3day",
  onViewChange,
  className,
}: MobileBottomNavProps) {
  return (
    <div
      className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden", className)}
    >
      <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      <div className="bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
        <div style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex items-stretch h-14">
            {VIEW_OPTIONS.map(({ value, shortLabel, icon: Icon }) => {
              const isActive = currentView === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onViewChange?.(value)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation active:opacity-60 transition-opacity"
                  aria-label={shortLabel}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={20}
                    className={cn(
                      "transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground/50",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-medium transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground/50",
                    )}
                  >
                    {shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
