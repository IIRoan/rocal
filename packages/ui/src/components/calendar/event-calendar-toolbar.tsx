import type { ReactNode } from "react";
import {
  AlignJustify,
  ChevronRightIcon,
  Columns3,
  LayoutGrid,
  Square,
  List as ListIcon,
} from "lucide-react";

import { AppLoadingState } from "../ui/app-loading-state";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { CalendarViewTitle } from "./calendar-view-title";
import type { CalendarView } from "./types";
import { CALENDAR_VIEW_SHORTCUTS } from "./use-calendar-view-shortcuts";

const VIEW_OPTIONS = [
  { value: "month", label: "Month", icon: LayoutGrid },
  { value: "week", label: "Week", icon: Columns3 },
  { value: "3day", label: "3 Days", icon: Columns3 },
  { value: "day", label: "Day", icon: Square },
  { value: "agenda", label: "Agenda", icon: AlignJustify },
] as const;

function ShortcutTooltip({
  children,
  label,
  shortcut,
}: {
  children: ReactNode;
  label: string;
  shortcut: string | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="ml-1.5">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function EventCalendarToolbar({
  currentDate,
  eventsLoading,
  loading,
  onNext,
  onPrefetchNext,
  onPrefetchPrevious,
  onPrevious,
  onSidebarToggle,
  onToday,
  onViewChange,
  showShortcuts = true,
  timezone,
  view,
  weekStartDay,
}: {
  currentDate: Date;
  eventsLoading?: boolean;
  loading?: boolean;
  onNext: () => void;
  onPrefetchNext?: () => void;
  onPrefetchPrevious?: () => void;
  onPrevious: () => void;
  onSidebarToggle?: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  showShortcuts?: boolean;
  timezone: string;
  view: CalendarView;
  weekStartDay: number;
}) {
  return (
    <div className="z-50 h-[var(--calendar-toolbar-height)] sm:h-[var(--calendar-toolbar-height-sm)] bg-background flex items-center justify-between gap-2 px-2 sm:px-4 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {onSidebarToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="peer size-7 text-muted-foreground/80 hover:text-foreground/80 hover:bg-transparent! sm:-ms-1.5"
            onClick={onSidebarToggle}
          >
            <ListIcon size={16} />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        )}
        <h2 className="min-w-0 truncate font-semibold text-base sm:text-xl">
          <CalendarViewTitle
            currentDate={currentDate}
            view={view}
            weekStartDay={weekStartDay}
            timezone={timezone}
          />
        </h2>
        {eventsLoading && (
          <AppLoadingState
            variant="inline-icon"
            size="sm"
            className="shrink-0"
          />
        )}
        <output className="sr-only">
          {eventsLoading ? "Loading events…" : ""}
        </output>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-border/60 bg-background shadow-xs overflow-hidden">
          <ShortcutTooltip label="Previous" shortcut={showShortcuts ? "K" : null}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-none text-muted-foreground/70 hover:text-foreground hover:bg-hover/60 -scale-x-[1]"
              onClick={onPrevious}
              onMouseEnter={onPrefetchPrevious}
              aria-label="Previous"
              disabled={loading}
            >
              <ChevronRightIcon size={16} aria-hidden="true" />
            </Button>
          </ShortcutTooltip>
          <Separator orientation="vertical" className="h-4" />
          <ShortcutTooltip label="Today" shortcut={showShortcuts ? "N" : null}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToday}
              disabled={loading}
              className="h-7 px-3 rounded-none text-xs font-medium hover:bg-hover/60"
            >
              Today
            </Button>
          </ShortcutTooltip>
          <Separator orientation="vertical" className="h-4" />
          <ShortcutTooltip label="Next" shortcut={showShortcuts ? "J" : null}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-none text-muted-foreground/70 hover:text-foreground hover:bg-hover/60"
              onClick={onNext}
              onMouseEnter={onPrefetchNext}
              aria-label="Next"
              disabled={loading}
            >
              <ChevronRightIcon size={16} aria-hidden="true" />
            </Button>
          </ShortcutTooltip>
        </div>
        <div className="inline-flex items-center rounded-md border border-border/60 bg-background shadow-xs p-0.5 gap-0.5">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = view === value;
            return (
              <ShortcutTooltip
                key={value}
                label={label}
                shortcut={showShortcuts ? CALENDAR_VIEW_SHORTCUTS[value] : null}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={label}
                  disabled={loading}
                  onClick={() => onViewChange(value)}
                  className={cn(
                    "inline-flex items-center justify-center h-6 w-7 rounded-sm",
                    "text-muted-foreground/70 hover:text-foreground hover:bg-hover/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:opacity-50 disabled:pointer-events-none",
                    active &&
                      "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground shadow-sm",
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                </button>
              </ShortcutTooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
