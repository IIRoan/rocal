"use client";

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
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

  const { currentDate, setCurrentDate, currentView, setCurrentView } = useCalendarContext();

  // Initialize context view from props on first render
  React.useEffect(() => {
    if (currentView === "month" && props.initialView && props.initialView !== "month") {
      // Check sessionStorage first
      if (typeof window !== "undefined") {
        const savedViewData = sessionStorage.getItem("calendar-view-selection");
        if (savedViewData) {
          try {
            const parsedData = JSON.parse(savedViewData);
            if (parsedData.expires && parsedData.expires > Date.now() && (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)) {
              setCurrentView(parsedData.view as CalendarView);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
      setCurrentView(props.initialView);
    }
  }, []); // Only run once on mount

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
  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view);
    // Also save to sessionStorage
    if (typeof window !== "undefined") {
      const expirationTime = new Date();
      expirationTime.setHours(expirationTime.getHours() + 1);
      const viewData = { view, expires: expirationTime.getTime() };
      sessionStorage.setItem("calendar-view-selection", JSON.stringify(viewData));
    }
  };
  const handleCalendarViewChange = handleViewChange;

  const handlePrevious = useCallback(() => {
    let newDate: Date;
    switch (currentView) {
      case "day": newDate = subDays(currentDate, 1); break;
      case "3day": newDate = subDays(currentDate, 3); break;
      case "week": newDate = subWeeks(currentDate, 1); break;
      case "month": newDate = subMonths(currentDate, 1); break;
      case "agenda": newDate = subDays(currentDate, AgendaDaysToShow); break;
      default: newDate = subWeeks(currentDate, 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, currentView, setCurrentDate]);

  const handleNext = useCallback(() => {
    let newDate: Date;
    switch (currentView) {
      case "day": newDate = addDays(currentDate, 1); break;
      case "3day": newDate = addDays(currentDate, 3); break;
      case "week": newDate = addWeeks(currentDate, 1); break;
      case "month": newDate = addMonths(currentDate, 1); break;
      case "agenda": newDate = addDays(currentDate, AgendaDaysToShow); break;
      default: newDate = addWeeks(currentDate, 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, currentView, setCurrentDate]);

  // Date helpers for adjacent slides
  const getNextDate = useCallback((date: Date) => {
    switch (currentView) {
      case "day": return addDays(date, 1);
      case "3day": return addDays(date, 3);
      case "week": return addWeeks(date, 1);
      case "month": return addMonths(date, 1);
      case "agenda": return addDays(date, AgendaDaysToShow);
      default: return addWeeks(date, 1);
    }
  }, [currentView]);

  const getPrevDate = useCallback((date: Date) => {
    switch (currentView) {
      case "day": return subDays(date, 1);
      case "3day": return subDays(date, 3);
      case "week": return subWeeks(date, 1);
      case "month": return subMonths(date, 1);
      case "agenda": return subDays(date, AgendaDaysToShow);
      default: return subWeeks(date, 1);
    }
  }, [currentView]);

  const prevDate = useMemo(() => getPrevDate(currentDate), [currentDate, getPrevDate]);
  const nextDate = useMemo(() => getNextDate(currentDate), [currentDate, getNextDate]);

  // Embla Carousel - 3 slides, start on center (index 1)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex: 1,
    align: "start",
    dragFree: false,
    dragThreshold: 20,
    inViewThreshold: 1,
  });

  // Infinite loop logic: on slide change, update date and recenter
  const isScrollingRef = useRef(false);

  const handleSlideSelect = useCallback(() => {
    if (!emblaApi || isScrollingRef.current) return;
    const newIndex = emblaApi.selectedScrollSnap();

    if (newIndex === 0) {
      isScrollingRef.current = true;
      handlePrevious();
    } else if (newIndex === 2) {
      isScrollingRef.current = true;
      handleNext();
    }
  }, [emblaApi, handlePrevious, handleNext]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", handleSlideSelect);
    return () => {
      emblaApi.off("select", handleSlideSelect);
    };
  }, [emblaApi, handleSlideSelect]);

  // After currentDate changes from a swipe, recenter carousel to slide 1 instantly.
  // Use a double-RAF to ensure React has flushed DOM updates before recentering.
  useEffect(() => {
    if (!emblaApi || !isScrollingRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!emblaApi) return;
        emblaApi.scrollTo(1, true);
        isScrollingRef.current = false;
      });
    });
  }, [currentDate, emblaApi]);

  // Edge swipe detection for sidebar - only triggers from screen edge
  const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch && touch.clientX < 15) {
      edgeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else {
      edgeSwipeStartRef.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!edgeSwipeStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - edgeSwipeStartRef.current.x;
    const dy = Math.abs(touch.clientY - edgeSwipeStartRef.current.y);
    // Only trigger sidebar if horizontal swipe is dominant and started from edge
    if (dx > 80 && dx > dy * 2 && edgeSwipeStartRef.current.x < 15) {
      setIsSidebarOpen(true);
    }
    edgeSwipeStartRef.current = null;
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

      {/* Main Calendar Content - Embla Carousel */}
      <div className={cn("flex-1 overflow-hidden relative w-full h-full", className)}>
        <div className="overflow-hidden h-full" ref={emblaRef} style={{ touchAction: "pan-y" }}>
          <div className="flex h-full">
            {/* Previous */}
            <div className="min-w-0 h-full overflow-y-auto pb-20 md:pb-0" style={{ flex: "0 0 100%", touchAction: "pan-y" }}>
              <MobileEventCalendar
                {...props}
                user={user}
                initialView={currentView}
                currentDateOverride={prevDate}
                onSidebarToggle={handleOpenSidebar}
                onViewChange={handleCalendarViewChange}
              />
            </div>
            {/* Current */}
            <div className="min-w-0 h-full overflow-y-auto pb-20 md:pb-0" style={{ flex: "0 0 100%", touchAction: "pan-y" }}>
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
            {/* Next */}
            <div className="min-w-0 h-full overflow-y-auto pb-20 md:pb-0" style={{ flex: "0 0 100%", touchAction: "pan-y" }}>
              <MobileEventCalendar
                {...props}
                user={user}
                initialView={currentView}
                currentDateOverride={nextDate}
                onSidebarToggle={handleOpenSidebar}
                onViewChange={handleCalendarViewChange}
              />
            </div>
          </div>
        </div>
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
