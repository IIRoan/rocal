import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import { AppLoadingState } from "../ui/app-loading-state";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ThemeToggle } from "../layout/theme-toggle";
import { MobileCalendarViewTitle } from "./calendar-view-title";
import type { CalendarView } from "./types";

export function MobileEventCalendarToolbar({
  currentDate,
  eventsLoading,
  loading,
  onNext,
  onNewEvent,
  onPrevious,
  onSidebarToggle,
  onToday,
  onViewChange,
  themeSettings,
  timezone,
  view,
  weekStartDay,
}: {
  currentDate: Date;
  eventsLoading?: boolean;
  loading?: boolean;
  onNext: () => void;
  onNewEvent: () => void;
  onPrevious: () => void;
  onSidebarToggle?: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  themeSettings?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
  timezone: string;
  view: CalendarView;
  weekStartDay: number;
}) {
  return (
    <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-5 sm:px-4">
      <div className="flex sm:flex-col max-sm:items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold text-xl">
            <MobileCalendarViewTitle
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
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center sm:gap-2 max-sm:order-1">
            <Button
              variant="ghost"
              size="icon"
              className="max-sm:size-8"
              onClick={onPrevious}
              aria-label="Previous"
              disabled={loading}
            >
              <ChevronLeftIcon size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="max-sm:size-8"
              onClick={onNext}
              aria-label="Next"
              disabled={loading}
            >
              <ChevronRightIcon size={16} aria-hidden="true" />
            </Button>
          </div>
          <Button
            className="max-sm:h-8 max-sm:px-2.5! bg-accent hover:bg-accent/80 text-accent-foreground"
            onClick={onToday}
            disabled={loading}
          >
            Today
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            className="max-sm:h-8 max-sm:px-2.5!"
            onClick={onNewEvent}
            disabled={loading}
          >
            New Event
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="gap-1.5 max-sm:h-8 max-sm:px-2! max-sm:gap-1"
                disabled={loading}
              >
                <span className="capitalize">{view}</span>
                <ChevronDownIcon
                  className="-me-1 opacity-60"
                  size={16}
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-32">
              <DropdownMenuItem onClick={() => onViewChange("month")}>
                Month <DropdownMenuShortcut>⌘+M</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange("week")}>
                Week <DropdownMenuShortcut>⌘+W</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange("day")}>
                Day <DropdownMenuShortcut>⌘+D</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange("agenda")}>
                Agenda <DropdownMenuShortcut>⌘+A</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewChange("3day")}>
                3 Days <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle useSettingsTheme={themeSettings} />
        </div>
      </div>
    </div>
  );
}
