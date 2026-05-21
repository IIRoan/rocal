"use client";

import React from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Grid3X3,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { format, startOfWeek, endOfWeek, addDays, isSameMonth } from "date-fns";
import { CalendarView } from "../calendar/types";
import { AgendaDaysToShow } from "../calendar/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const VIEW_OPTIONS: Array<{
  value: CalendarView;
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { value: "day", label: "Day", shortLabel: "Day", Icon: CalendarDays },
  { value: "3day", label: "3 Days", shortLabel: "3 Days", Icon: Columns3 },
  { value: "week", label: "Week", shortLabel: "Week", Icon: Grid3X3 },
  { value: "month", label: "Month", shortLabel: "Month", Icon: Calendar },
  { value: "agenda", label: "Agenda", shortLabel: "List", Icon: LayoutGrid },
];

interface MobileTopNavProps {
  currentDate: Date;
  currentView: CalendarView;
  onPrevious?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  onViewChange?: (view: CalendarView) => void;
  onOpenQuickNav?: () => void;
  onOpenSidebar?: () => void;
  onOpenAddEvent?: () => void;
  appSwitcher?: React.ReactNode;
  className?: string;
}

export function MobileTopNav({
  currentDate,
  currentView,
  onPrevious,
  onNext,
  onToday,
  onViewChange,
  onOpenQuickNav,
  onOpenSidebar,
  onOpenAddEvent,
  appSwitcher,
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
  const currentViewLabel =
    VIEW_OPTIONS.find((option) => option.value === currentView)?.shortLabel ??
    "View";

  return (
    <div
        className={cn(
          "sticky top-0 z-[45] border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden",
          className,
        )}
      >
      <div className="safe-area-inset-top px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenSidebar}
            className="size-9 rounded-xl text-muted-foreground"
            aria-label="Open calendar sidebar"
          >
            <Menu size={18} />
          </Button>

          <div className="flex min-w-0 flex-1 justify-center">
            {appSwitcher ? (
              appSwitcher
            ) : (
              <div className="inline-flex items-center rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                Calendar
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenAddEvent}
            className="size-9 rounded-xl text-muted-foreground"
            aria-label="Add new event"
          >
            <Plus size={18} />
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onPrevious}
            className="size-9 shrink-0 rounded-xl text-muted-foreground"
            aria-label="Previous period"
          >
            <ChevronLeft size={18} />
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={onOpenQuickNav}
            className="h-auto min-w-0 flex-1 rounded-2xl px-3 py-2 text-left hover:bg-accent/50 active:bg-accent/70"
            aria-label="Open calendar quick navigation"
          >
            <div className="truncate text-sm font-medium">{displayText.main}</div>
            {displayText.sub && (
              <div className="truncate text-xs text-muted-foreground">
                {displayText.sub}
              </div>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            className="size-9 shrink-0 rounded-xl text-muted-foreground"
            aria-label="Next period"
          >
            <ChevronRight size={18} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 shrink-0 rounded-2xl px-3 text-xs font-medium text-muted-foreground"
                aria-label="Open calendar actions"
              >
                <span className="max-w-16 truncate">{currentViewLabel}</span>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-52 rounded-2xl border-border/60 p-1.5"
            >
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={onToday}
                className="gap-2.5 rounded-xl px-3 py-2"
              >
                <Calendar size={16} />
                Today
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>View</DropdownMenuLabel>
              {VIEW_OPTIONS.map(({ value, label, Icon }) => {
                const isActive = currentView === value;
                return (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => onViewChange?.(value)}
                    className="gap-2.5 rounded-xl px-3 py-2"
                  >
                    <Icon size={16} className="text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    {isActive && <Check size={15} className="text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
