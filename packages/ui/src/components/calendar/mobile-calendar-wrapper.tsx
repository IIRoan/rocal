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
  const [currentView, setCurrentView] = useState<CalendarView>(() => {
    // Check sessionStorage first, then fall back to props or day view
    if (typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('calendar-view-selection');
      if (savedView && ['month', 'week', 'day', 'agenda'].includes(savedView)) {
        return savedView as CalendarView;
      }
    }
    // Default to day view on mobile if no initialView is provided
    return props.initialView || "day";
  });
  const { currentDate, setCurrentDate } = useCalendarContext();

  const handleDateChange = (date: Date) => {
    setCurrentDate(date);
  };

  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  const handleOpenAddEvent = () => {
    onOpenAddEvent?.();
    // Close sidebar if open when creating new event
    setIsSidebarOpen(false);
  };

  const handleOpenSettings = () => {
    console.log('handleOpenSettings called, onOpenSettings:', onOpenSettings);
    onOpenSettings?.();
    // Close sidebar if open when opening settings
    setIsSidebarOpen(false);
  };

  const handleViewChange = (view: CalendarView) => {
    console.log('MobileCalendarWrapper - handleViewChange:', view);
    setCurrentView(view);
  };

  const handleCalendarViewChange = (view: CalendarView) => {
    console.log('MobileCalendarWrapper - handleCalendarViewChange from MobileEventCalendar:', view);
    setCurrentView(view);
  };

  // Only sync with props.initialView if it's explicitly different and no session preference exists
  React.useEffect(() => {
    if (props.initialView && typeof window !== 'undefined') {
      const savedView = sessionStorage.getItem('calendar-view-selection');
      if (!savedView && props.initialView !== currentView) {
        setCurrentView(props.initialView);
      }
    }
  }, [props.initialView, currentView]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Mobile Week Navigation - only visible on mobile */}
      <MobileWeekNav
        currentDate={currentDate}
        currentView={currentView}
        onDateChange={handleDateChange}
        className="md:hidden"
      />

      {/* Main Calendar Content - allow scrolling with bottom padding for mobile nav */}
      <div className={cn("flex-1 overflow-auto pb-20 md:pb-0", className)}>
        {children || <MobileEventCalendar {...props} initialView={currentView} onSidebarToggle={handleOpenSidebar} onViewChange={handleCalendarViewChange} />}
      </div>

      {/* Mobile Bottom Navigation - only visible on mobile */}
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
          className="w-80 p-0"
        >
          <VisuallyHidden>
            <SheetTitle>Calendar Sidebar</SheetTitle>
            <SheetDescription>
              Access your calendars, mini calendar, and account settings
            </SheetDescription>
          </VisuallyHidden>
          
          <SidebarProvider defaultOpen={true}>
            <AppSidebar
              user={user}
              onLogout={onLogout}
              onOpenSettings={handleOpenSettings}
              onOpenCalendarManagement={onOpenCalendarManagement}
              isMobile={true}
            />
          </SidebarProvider>
        </SheetContent>
      </Sheet>
    </div>
  );
}