"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { motion, PanInfo, useAnimation, useMotionValue } from "motion/react";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "./mobile-event-calendar";
import { MobileBottomNav } from "../navigation/mobile-bottom-nav";
import { MobileTopNav } from "../navigation/mobile-top-nav";
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
import { CalendarEvent, CalendarView, User, CALENDAR_VIEWS } from "./types";
import { AgendaDaysToShow } from "./constants";
import { cn } from "../../lib/utils";
import {
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

interface MobileCalendarWrapperProps extends MobileEventCalendarProps {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenAddEvent?: () => void;
  getCachedEventsForRange?: (range: { start: Date; end: Date }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
}

export function MobileCalendarWrapper({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenAddEvent,
  getCachedEventsForRange,
  prefetchRange,
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
      if (savedView && (CALENDAR_VIEWS as readonly string[]).includes(savedView)) {
        return savedView as CalendarView;
      }
    }
    return props.initialView || "3day";
  });

  const { currentDate, setCurrentDate } = useCalendarContext();

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (!savedView && isMobile) {
        setCurrentView("3day");
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

  const handlePrevious = () => {
    let newDate: Date;
    switch (currentView) {
      case "day":
        newDate = subDays(currentDate, 1);
        break;
      case "3day":
        newDate = subDays(currentDate, 3);
        break;
      case "week":
        newDate = subWeeks(currentDate, 1);
        break;
      case "month":
        newDate = subMonths(currentDate, 1);
        break;
      case "agenda":
        newDate = subDays(currentDate, AgendaDaysToShow);
        break;
      default:
        newDate = subWeeks(currentDate, 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    let newDate: Date;
    switch (currentView) {
      case "day":
        newDate = addDays(currentDate, 1);
        break;
      case "3day":
        newDate = addDays(currentDate, 3);
        break;
      case "week":
        newDate = addWeeks(currentDate, 1);
        break;
      case "month":
        newDate = addMonths(currentDate, 1);
        break;
      case "agenda":
        newDate = addDays(currentDate, AgendaDaysToShow);
        break;
      default:
        newDate = addWeeks(currentDate, 1);
    }
    setCurrentDate(newDate);
  };

  React.useEffect(() => {
    if (props.initialView && typeof window !== "undefined") {
      const savedView = sessionStorage.getItem("calendar-view-selection");
      if (!savedView && props.initialView !== currentView) {
        setCurrentView(props.initialView);
      }
    }
  }, [props.initialView, currentView]);

  // Swipe handling using framer-motion
  const controls = useAnimation();
  const x = useMotionValue(0);
  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  const [panStartPos, setPanStartPos] = useState({ x: 0, y: 0 });

  const getNextDate = (date: Date) => {
    switch (currentView) {
      case "day": return addDays(date, 1);
      case "3day": return addDays(date, 3);
      case "week": return addWeeks(date, 1);
      case "month": return addMonths(date, 1);
      case "agenda": return addDays(date, AgendaDaysToShow);
      default: return addWeeks(date, 1);
    }
  };

  const getPrevDate = (date: Date) => {
    switch (currentView) {
      case "day": return subDays(date, 1);
      case "3day": return subDays(date, 3);
      case "week": return subWeeks(date, 1);
      case "month": return subMonths(date, 1);
      case "agenda": return subDays(date, AgendaDaysToShow);
      default: return subWeeks(date, 1);
    }
  };

  const prevDate = useMemo(() => getPrevDate(currentDate), [currentDate, currentView]);
  const nextDate = useMemo(() => getNextDate(currentDate), [currentDate, currentView]);

  const handleDragEnd = (e: any, { offset, velocity }: PanInfo) => {
    // If the drag started near the left edge and moved right, don't trigger normal swipe,
    // let it just snap back, because it might be the edge swipe to open sidebar.
    if (offset.x > 0 && panStartPos.x < 30) {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } });
      return;
    }

    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -swipeConfidenceThreshold) {
      // Swipe left -> Next period
      controls.start({ x: "-66.666%", transition: { duration: 0.2 } }).then(() => {
        handleNext();
        controls.set({ x: "-33.333%" });
      });
    } else if (swipe > swipeConfidenceThreshold) {
      // Swipe right -> Previous period
      controls.start({ x: "0%", transition: { duration: 0.2 } }).then(() => {
        handlePrevious();
        controls.set({ x: "-33.333%" });
      });
    } else {
      // Didn't swipe hard enough, snap back
      controls.start({ x: "-33.333%", transition: { type: "spring", stiffness: 300, damping: 30 } });
    }
  };

  const handleDragStart = (e: any, info: PanInfo) => {
    // Record where the drag started to detect edge swipes
    setPanStartPos({ x: info.point.x, y: info.point.y });
  };

  // Keep the edge swipe handler for opening the sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch && touch.clientX < 30) {
       // Just record it, the touchEnd will handle the open
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (touch && touch.clientX > 50 && panStartPos.x < 30) {
       setIsSidebarOpen(true);
    }
  };

  return (
    <div 
      className="relative flex flex-col h-dvh md:h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile top navigation */}
      {isMobile && (
        <MobileTopNav
          currentDate={currentDate}
          currentView={currentView}
          onOpenQuickNav={handleOpenQuickNav}
          onOpenSidebar={handleOpenSidebar}
          onOpenAddEvent={handleOpenAddEvent}
          className="md:hidden"
        />
      )}

      {/* Main Calendar Content */}
      <div className={cn("flex-1 overflow-hidden relative w-full h-full", className)}>
        <motion.div
          className="absolute inset-y-0 flex w-[300%] h-full"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          animate={controls}
          initial={{ x: "-33.333%" }}
        >
          <div className="w-1/3 h-full overflow-y-auto pb-20 md:pb-0">
            <MobileEventCalendar
              {...props}
              user={user}
              initialView={currentView}
              currentDateOverride={prevDate}
              onSidebarToggle={handleOpenSidebar}
              onViewChange={handleCalendarViewChange}
            />
          </div>
          <div className="w-1/3 h-full overflow-y-auto pb-20 md:pb-0">
            {children || (
              <MobileEventCalendar
                {...props}
                user={user}
                initialView={currentView}
                currentDateOverride={currentDate}
                onSidebarToggle={handleOpenSidebar}
                onViewChange={handleCalendarViewChange}
              />
            )}
          </div>
          <div className="w-1/3 h-full overflow-y-auto pb-20 md:pb-0">
            <MobileEventCalendar
              {...props}
              user={user}
              initialView={currentView}
              currentDateOverride={nextDate}
              onSidebarToggle={handleOpenSidebar}
              onViewChange={handleCalendarViewChange}
            />
          </div>
        </motion.div>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        currentDate={currentDate}
        onDateChange={handleDateChange}
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
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
              onDateSelect={handleCloseQuickNav}
              isMobile={true}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent
          side="left"
          showClose={false}
          className="w-[85vw] max-w-[320px] h-[100dvh] p-0 border-r border-border rounded-none safe-area-inset-top safe-area-inset-bottom"
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
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
              isMobile={true}
            />
          </SidebarProvider>
        </SheetContent>
      </Sheet>
    </div>
  );
}
