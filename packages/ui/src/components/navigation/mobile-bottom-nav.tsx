"use client";

import React, { useState } from "react";
import {
  Calendar,
  Plus,
  Grid3X3,
  LayoutGrid,
  CalendarDays,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CalendarView } from "../calendar/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

interface MobileBottomNavProps {
  onOpenSidebar?: () => void;
  onOpenAddEvent?: () => void;
  currentView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  onToday?: () => void;
  className?: string;
}

const VIEW_OPTIONS: {
  value: CalendarView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { value: "day", label: "Day", shortLabel: "Day", icon: CalendarDays },
  { value: "week", label: "Week", shortLabel: "Week", icon: Grid3X3 },
  { value: "month", label: "Month", shortLabel: "Month", icon: Calendar },
  { value: "agenda", label: "Agenda", shortLabel: "List", icon: LayoutGrid },
];

function getViewIcon(view: CalendarView, size = 20) {
  const option = VIEW_OPTIONS.find((opt) => opt.value === view);
  const Icon = option?.icon || Calendar;
  return <Icon size={size} />;
}

// Unified tab button component for consistent styling
const TabButton = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    label: React.ReactNode;
    onClick?: () => void;
    isActive?: boolean;
    hasDropdown?: boolean;
    isDropdownOpen?: boolean;
  }
>(({ icon, label, onClick, isActive = false, hasDropdown = false, isDropdownOpen = false }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-manipulation"
    >
      <div className={cn(
        "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150",
        isActive && "bg-primary/10",
        !isActive && "active:bg-accent/50",
      )}>
        {icon}
      </div>
      <div className="flex items-center gap-0.5">
        <span className={cn(
          "text-[10px] font-medium",
          isActive ? "text-primary" : "text-muted-foreground",
        )}>
          {label}
        </span>
        {hasDropdown && (
          <ChevronDown
            size={9}
            className={cn(
              "text-muted-foreground transition-transform duration-200 -mt-0.5",
              isDropdownOpen && "rotate-180",
            )}
          />
        )}
      </div>
    </button>
  );
});

TabButton.displayName = "TabButton";

export function MobileBottomNav({
  onOpenSidebar,
  onOpenAddEvent,
  currentView = "month",
  onViewChange,
  onToday,
  className,
}: MobileBottomNavProps) {
  const [isViewOpen, setIsViewOpen] = useState(false);

  return (
    <div
      className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden", className)}
    >
      {/* Premium glassmorphism background */}
      <div className="relative">
        {/* Subtle gradient line at top */}
        <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
        
        {/* Main background */}
        <div className="bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
          {/* Safe area padding */}
          <div className="pb-[env(safe-area-inset-bottom)]">
            {/* Tab bar - 4 evenly spaced tabs */}
            <div className="flex items-center h-12">
              {/* Today Button */}
              <TabButton
                icon={<Calendar size={20} className="text-muted-foreground" />}
                label="Today"
                onClick={onToday}
              />

              {/* Add Event Button */}
              <TabButton
                icon={<Plus size={20} className="text-muted-foreground" />}
                label="Add"
                onClick={onOpenAddEvent}
              />

              {/* View Switcher */}
              <Popover open={isViewOpen} onOpenChange={setIsViewOpen}>
                <PopoverTrigger asChild>
                  <TabButton
                    icon={getViewIcon(currentView, 20)}
                    label={VIEW_OPTIONS.find((opt) => opt.value === currentView)?.shortLabel || "View"}
                    isActive={isViewOpen}
                    hasDropdown
                    isDropdownOpen={isViewOpen}
                  />
                </PopoverTrigger>
                <PopoverContent
                  align="center"
                  side="top"
                  sideOffset={8}
                  className="w-44 p-1.5 rounded-2xl shadow-xl border-border/50 bg-popover/95 backdrop-blur-xl"
                >
                  {/* View options */}
                  <div className="space-y-0.5">
                    {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
                      const isActive = currentView === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            onViewChange?.(value);
                            setIsViewOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-accent/60 active:bg-accent",
                          )}
                        >
                          <Icon size={18} />
                          <span className="flex-1 text-left">{label}</span>
                          {isActive && (
                            <Check size={16} className="text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Calendars/Sidebar */}
              <TabButton
                icon={<LayoutGrid size={20} className="text-muted-foreground" />}
                label="Cals"
                onClick={onOpenSidebar}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
