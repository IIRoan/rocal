"use client";

import React, { useRef, useMemo, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "./mobile-event-calendar";
import { MobileBottomNav } from "../navigation/mobile-bottom-nav";
import { MobileTopNav } from "../navigation/mobile-top-nav";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import { AppSidebar } from "../layout/app-sidebar";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "../ui/drawer";
import { SidebarProvider } from "../ui/sidebar";
import { VisuallyHidden } from "../ui/visually-hidden";
import { useCalendarContext } from "./calendar-context";
import { useIsMobile, useSwipeablePanel } from "../../hooks";
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
  const [isQuickNavOpen, setIsQuickNavOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const hasInitializedMobileDate = React.useRef(false);
  const sidebarPanelRef = useRef<HTMLDivElement>(null);
  const sidebarOverlayRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

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

  React.useEffect(() => {
    if (isMobile && !hasInitializedMobileDate.current) {
      hasInitializedMobileDate.current = true;
      const today = new Date();
      setCurrentDate(today);
    }
  }, [isMobile, setCurrentDate]);

  const {
    isOpen: isSidebarOpen,
    open: handleOpenSidebar,
    close: handleCloseSidebar,
  } = useSwipeablePanel({
    panelRef: sidebarPanelRef,
    overlayRef: sidebarOverlayRef,
    gestureTargetRef: mainContainerRef,
    panelWidthPx: 320,
    gesturePriority: 40,
  });

  const handleDateChange = (date: Date) => setCurrentDate(date);
  const handleToday = () => setCurrentDate(new Date());
  const handleOpenQuickNav = () => setIsQuickNavOpen(true);
  const handleCloseQuickNav = () => setIsQuickNavOpen(false);
  const handleOpenAddEvent = () => {
    onOpenAddEvent?.();
    handleCloseSidebar();
  };
  const handleOpenSettings = () => {
    onOpenSettings?.();
    handleCloseSidebar();
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

  return (
    <div ref={mainContainerRef} className="relative flex flex-col h-dvh md:h-full overflow-hidden">
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

      {/* Sidebar backdrop overlay */}
      <div
        ref={sidebarOverlayRef}
        className="fixed inset-0 z-40 bg-black/50"
        style={{ opacity: 0, pointerEvents: "none" }}
        onClick={handleCloseSidebar}
        aria-hidden={!isSidebarOpen}
      />

      {/* Sidebar panel — driven by gesture transform */}
      <div
        ref={sidebarPanelRef}
        className="fixed top-0 left-0 z-50 h-[100dvh] w-[85vw] max-w-[320px] border-r border-border bg-background safe-area-inset-top safe-area-inset-bottom"
        style={{ transform: "translateX(-320px)", willChange: "transform" }}
        role="dialog"
        aria-modal="true"
        aria-label="Calendar Sidebar"
        aria-hidden={!isSidebarOpen}
      >
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
            onClose={handleCloseSidebar}
          />
        </SidebarProvider>
      </div>
    </div>
  );
}
