"use client";

import React from "react";
import {
  Calendar,
  Plus,
  Grid3X3,
  LayoutGrid,
  CalendarDays,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CalendarView } from "../calendar/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface MobileBottomNavProps {
  onOpenSidebar?: () => void;
  onOpenAddEvent?: () => void;
  currentView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  className?: string;
}

const VIEW_OPTIONS: {
  value: CalendarView;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "day", label: "Day", icon: <CalendarDays size={16} /> },
  { value: "week", label: "Week", icon: <Grid3X3 size={16} /> },
  { value: "month", label: "Month", icon: <Calendar size={16} /> },
  { value: "agenda", label: "Agenda", icon: <LayoutGrid size={16} /> },
];

function getViewIcon(view: CalendarView, size = 20) {
  switch (view) {
    case "day":
      return <CalendarDays size={size} />;
    case "week":
      return <Grid3X3 size={size} />;
    case "month":
      return <Calendar size={size} />;
    case "agenda":
      return <LayoutGrid size={size} />;
    default:
      return <Calendar size={size} />;
  }
}

export function MobileBottomNav({
  onOpenSidebar,
  onOpenAddEvent,
  currentView = "month",
  onViewChange,
  className,
}: MobileBottomNavProps) {
  return (
    <div
      className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden", className)}
    >
      <div className="border-t border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch h-14">
          {/* Calendars */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground active:bg-accent/60 transition-colors touch-manipulation"
          >
            <Calendar size={20} />
            <span className="text-[10px] font-medium">Calendars</span>
          </button>

          {/* Add Event */}
          <button
            type="button"
            onClick={onOpenAddEvent}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-primary active:bg-primary/10 transition-colors touch-manipulation"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus size={18} />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              Add
            </span>
          </button>

          {/* View Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground active:bg-accent/60 transition-colors touch-manipulation outline-none"
              >
                {getViewIcon(currentView)}
                <span className="text-[10px] font-medium capitalize">
                  {currentView}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-40 rounded-xl mb-1"
            >
              {VIEW_OPTIONS.map(({ value, label, icon }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onViewChange?.(value)}
                  className={cn(
                    "gap-2",
                    currentView === value && "bg-accent text-accent-foreground",
                  )}
                >
                  {icon}
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
