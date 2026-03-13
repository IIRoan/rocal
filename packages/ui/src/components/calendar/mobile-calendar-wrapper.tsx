"use client";

import React, { useState } from "react";
import { MobileEventCalendar, MobileEventCalendarProps } from "./mobile-event-calendar";
import { MobileBottomNav } from "../navigation/mobile-bottom-nav";
import { MobileWeekNav } from "../navigation/mobile-week-nav";
import { AppSidebar } from "../layout/app-sidebar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../ui/sheet";
import { SidebarProvider } from "../ui/sidebar";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useCalendarContext } from "./calendar-context";
import { CalendarView } from "./types";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../hooks/use-mobile";
import { StickyMiniCalendar } from "./sticky-mini-calendar";

interface MobileCalendarWrapperProps extends MobileEventCalendarProps {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenAddEvent?: () => void;
}

export function MobileCalendarWrapper({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenAddEvent,
  children,
  className,
  ...props
}: MobileCalendarWrapperProps & { children?: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  
  const [currentView, setCurrentView] = useState<CalendarView>(() => {
    if (typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('calendar-view-selection');
      if (savedView && ['month', 'week', 'day', 'agenda'].includes(savedView)) {
        return savedView as CalendarView;
      }
    }
    return props.initialView || "month";
  });
  
  const { currentDate, setCurrentDate } = useCalendarContext();

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('calendar-view-selection');
      if (!savedView && isMobile) {
        setCurrentView("day");
      }
    }
  }, [isMobile]);

  const handleDateChange = (date: Date) => setCurrentDate(date);
  const handleOpenSidebar = () => setIsSidebarOpen(true);
  const handleCloseSidebar = () => setIsSidebarOpen(false);
  const handleOpenAddEvent = () => {
    onOpenAddEvent?.();
    setIsSidebarOpen(false);
  };
  const handleOpenSettings = () => {
    onOpenSettings?.();
    setIsSidebarOpen(false);
  };
  const handleViewChange = (view: CalendarView) => setCurrentView(view);
  const handleCalendarViewChange = (view: CalendarView) => setCurrentView(view);

  React.useEffect(() => {
    if (props.initialView && typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('calendar-view-selection');
      if (!savedView && props.initialView !== currentView) {
        setCurrentView(props.initialView);
      }
    }
  }, [props.initialView, currentView]);

  const showSeparateNav = currentView === "month" || currentView === "agenda";
  const showMiniCalendar = currentView === "day" || currentView === "week";

  return (
    <div className="relative flex flex-col h-full">
      {/* Fixed Mini Calendar for day/week views */}
      {showMiniCalendar && isMobile && (
        <StickyMiniCalendar
          events={props.events}
          onDisplayMonthChange={props.onDateRangeChange}
          onEventSelect={props.onEventEdit}
          weekStartDay={props.weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          workingDays={props.workingDays}
          timezone={props.timezone}
          showDayStrip={currentView === "week"}
          showAllDayEvents={currentView === "day"}
        />
      )}

      {/* Mobile Week Navigation - only for month/agenda views */}
      {showSeparateNav && (
        <MobileWeekNav
          currentDate={currentDate}
          currentView={currentView}
          onDateChange={handleDateChange}
          className="md:hidden"
        />
      )}

      {/* Main Calendar Content */}
      <div className={cn("flex-1 overflow-y-auto pb-20 md:pb-0 md:overflow-hidden", className)}>
        {children || <MobileEventCalendar {...props} initialView={currentView} onSidebarToggle={handleOpenSidebar} onViewChange={handleCalendarViewChange} />}
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        onOpenSidebar={handleOpenSidebar}
        onOpenAddEvent={handleOpenAddEvent}
        currentView={currentView}
        onViewChange={handleViewChange}
        className="md:hidden"
      />

      {/* Mobile Sidebar Drawer */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent 
          side="left" 
          className="w-[85vw] max-w-80 p-0 safe-area-inset-top safe-area-inset-bottom"
        >
          <VisuallyHidden>
            <SheetTitle>Calendar Sidebar</SheetTitle>
            <SheetDescription>Access your calendars, mini calendar, and account settings</SheetDescription>
          </VisuallyHidden>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar
              user={user}
              onLogout={onLogout}
              onOpenSettings={handleOpenSettings}
              onOpenCalendarManagement={onOpenCalendarManagement}
              events={props.events}
              onMiniCalendarMonthChange={props.onDateRangeChange}
              isMobile={true}
            />
          </SidebarProvider>
        </SheetContent>
      </Sheet>
    </div>
  );
}