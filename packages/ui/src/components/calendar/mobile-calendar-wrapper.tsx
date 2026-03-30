"use client";

import React, { useState } from "react";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "./mobile-event-calendar";
import { MobileBottomNav } from "../navigation/mobile-bottom-nav";
import { MobileWeekNav } from "../navigation/mobile-week-nav";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import { AppSidebar } from "../layout/app-sidebar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "../ui/drawer";
import { SidebarProvider } from "../ui/sidebar";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useCalendarContext } from "./calendar-context";
import { useIsMobile } from "../../hooks/use-mobile";
import { CalendarView, User } from "./types";
import { cn } from "../../lib/utils";

interface MobileCalendarWrapperProps extends MobileEventCalendarProps {
  user?: User;
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
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const hasInitializedMobileDate = React.useRef(false);

  const [currentView, setCurrentView] = useState<CalendarView>(() => {
    if (typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (savedView && ["month", "week", "day", "agenda"].includes(savedView)) {
        return savedView as CalendarView;
      }
    }
    return props.initialView || "month";
  });

  const { currentDate, setCurrentDate } = useCalendarContext();

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (!savedView && isMobile) {
        setCurrentView("day");
      }
    }
  }, [isMobile]);

  // On mobile, always start at current week on boot
  React.useEffect(() => {
    if (isMobile && !hasInitializedMobileDate.current) {
      hasInitializedMobileDate.current = true;
      const today = new Date();
      setCurrentDate(today);
    }
  }, [isMobile, setCurrentDate]);

  const handleDateChange = (date: Date) => setCurrentDate(date);
  const handleToday = () => setCurrentDate(new Date());
  const handleOpenSidebar = () => setIsSidebarOpen(true);
  const handleOpenQuickNav = () => setIsQuickNavOpen(true);
  const handleCloseQuickNav = () => setIsQuickNavOpen(false);
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
    if (props.initialView && typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (!savedView && props.initialView !== currentView) {
        setCurrentView(props.initialView);
      }
    }
  }, [props.initialView, currentView]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Mobile quick navigation at the top */}
      {isMobile && (
        <MobileWeekNav
          currentDate={currentDate}
          currentView={currentView}
          onDateChange={handleDateChange}
          onOpenQuickNav={handleOpenQuickNav}
          className="md:hidden"
        />
      )}

      {/* Main Calendar Content */}
      <div
        className={cn(
          "flex-1 overflow-y-auto pb-20 md:pb-0 md:overflow-hidden",
          className,
        )}
      >
        {children || (
          <MobileEventCalendar
            {...props}
            user={user}
            initialView={currentView}
            onSidebarToggle={handleOpenSidebar}
            onViewChange={handleCalendarViewChange}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        onOpenSidebar={handleOpenSidebar}
        onOpenAddEvent={handleOpenAddEvent}
        currentView={currentView}
        onViewChange={handleViewChange}
        onToday={handleToday}
        className="md:hidden"
      />

      {/* Mobile Quick Navigation Drawer */}
      <Drawer
        open={isQuickNavOpen}
        onOpenChange={setIsQuickNavOpen}
        direction="bottom"
      >
        <DrawerContent className="w-full p-0 sm:max-w-none max-h-[85dvh] overflow-hidden safe-area-inset-bottom">
          <VisuallyHidden>
            <DrawerTitle>Quick Date Navigation</DrawerTitle>
            <DrawerDescription>
              Select a date from the mini calendar.
            </DrawerDescription>
          </VisuallyHidden>
          <div className="p-4 pt-6">
            <SidebarCalendar
              events={props.events}
              onDisplayMonthChange={props.onDateRangeChange}
              rangeChangeDebounceMs={150}
              onDateSelect={handleCloseQuickNav}
              isMobile={true}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Mobile Sidebar Drawer */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent
          side="bottom"
          showClose={false}
          className="w-full h-[100dvh] p-0 border-none rounded-none sm:max-w-none safe-area-inset-top safe-area-inset-bottom"
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
