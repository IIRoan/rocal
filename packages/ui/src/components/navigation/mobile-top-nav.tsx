"use client";

import React from "react";
import { Menu, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
} from "date-fns";
import { CalendarView } from "../calendar/types";
import { AgendaDaysToShow } from "../calendar/constants";

interface MobileTopNavProps {
  currentDate: Date;
  currentView: CalendarView;
  onOpenQuickNav?: () => void;
  onOpenSidebar?: () => void;
  onOpenAddEvent?: () => void;
  className?: string;
}

export function MobileTopNav({
  currentDate,
  currentView,
  onOpenQuickNav,
  onOpenSidebar,
  onOpenAddEvent,
  className,
}: MobileTopNavProps) {
  const getDisplayText = () => {
    switch (currentView) {
      case "day":
        return {
          main: format(currentDate, "EEEE, MMM d"),
          sub: format(currentDate, "yyyy"),
        };
      case "3day": {
        const start = addDays(currentDate, -1);
        const end = addDays(currentDate, 1);
        if (isSameMonth(start, end)) {
          return {
            main: `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`,
            sub: "3 Days",
          };
        } else {
          return {
            main: `${format(start, "MMM d")} - ${format(end, "MMM d")}`,
            sub: format(end, "yyyy"),
          };
        }
      }
      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          main: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`,
          sub: `Week ${format(currentDate, "w")}`,
        };
      case "month":
        return {
          main: format(currentDate, "MMMM yyyy"),
          sub: "",
        };
      case "agenda":
        const agendaEnd = addDays(currentDate, AgendaDaysToShow - 1);
        if (isSameMonth(currentDate, agendaEnd)) {
          return {
            main: format(currentDate, "MMMM yyyy"),
            sub: `${AgendaDaysToShow} days`,
          };
        } else {
          return {
            main: `${format(currentDate, "MMM")} - ${format(agendaEnd, "MMM yyyy")}`,
            sub: `${AgendaDaysToShow} days`,
          };
        }
      default:
        const defaultWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const defaultWeekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          main: `${format(defaultWeekStart, "MMM d")} - ${format(defaultWeekEnd, "MMM d, yyyy")}`,
          sub: `Week ${format(currentDate, "w")}`,
        };
    }
  };

  const displayText = getDisplayText();

  return (
    <div
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border md:hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 safe-area-inset-top">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSidebar}
          className="p-2"
        >
          <Menu size={24} />
        </Button>

        <button
          type="button"
          onClick={onOpenQuickNav}
          className="flex-1 text-center rounded-md px-2 py-1 hover:bg-accent/50 active:bg-accent/70 transition-colors mx-2"
          aria-label="Open calendar quick navigation"
        >
          <div className="text-sm font-medium">{displayText.main}</div>
          {displayText.sub && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {displayText.sub}
            </div>
          )}
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenAddEvent}
          className="p-2"
        >
          <Plus size={24} />
        </Button>
      </div>
    </div>
  );
}
