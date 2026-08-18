"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "./mobile-event-calendar";
import { MobileCalendarOverlays } from "./mobile-calendar-overlays";
import { shiftMobileCalendarDate } from "./mobile-calendar-navigation";
import { MobileTopNav } from "../navigation/mobile-top-nav";
import { useCalendarContext } from "./calendar-context";
import { useIsMobile } from "../../hooks/use-mobile";
import { CalendarEvent, CalendarView, User } from "./types";
import { cn } from "../../lib/utils";

interface MobileCalendarWrapperProps extends MobileEventCalendarProps {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenSearch?: () => void;
  onOpenAddEvent?: () => void;
  appSwitcher?: React.ReactNode;
  getCachedEventsForRange?: (range: {
    start: Date;
    end: Date;
  }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
}

export function MobileCalendarWrapper({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenSearch,
  onOpenAddEvent,
  appSwitcher,
  getCachedEventsForRange,
  prefetchRange,
  children,
  className,
  ...props
}: MobileCalendarWrapperProps & { children?: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const isMobile = useIsMobile();

  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();

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
  const handleOpenSearch = () => {
    onOpenSearch?.();
    setIsSidebarOpen(false);
  };
  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view);
  };

  const handlePrevious = useCallback(() => {
    setCurrentDate(shiftMobileCalendarDate(currentDate, currentView, -1));
  }, [currentDate, currentView, setCurrentDate]);

  const handleNext = useCallback(() => {
    setCurrentDate(shiftMobileCalendarDate(currentDate, currentView, 1));
  }, [currentDate, currentView, setCurrentDate]);

  const prevDate = useMemo(
    () => shiftMobileCalendarDate(currentDate, currentView, -1),
    [currentDate, currentView],
  );
  const nextDate = useMemo(
    () => shiftMobileCalendarDate(currentDate, currentView, 1),
    [currentDate, currentView],
  );

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

  const handleSlideSelectRef = useRef(() => {});

  useLayoutEffect(() => {
    handleSlideSelectRef.current = () => {
      if (!emblaApi || isScrollingRef.current) return;
      const newIndex = emblaApi.selectedScrollSnap();

      if (newIndex === 0) {
        isScrollingRef.current = true;
        handlePrevious();
      } else if (newIndex === 2) {
        isScrollingRef.current = true;
        handleNext();
      }
    };
  }, [emblaApi, handlePrevious, handleNext]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      handleSlideSelectRef.current();
    };
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

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
      className="relative flex h-dvh flex-col overflow-hidden safe-area-inset-bottom lg:h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile top navigation */}
      {isMobile && (
        <MobileTopNav
          currentDate={currentDate}
          currentView={currentView}
          weekStartDay={props.weekStartDay}
          timezone={props.timezone}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToday={handleToday}
          onViewChange={handleViewChange}
          onOpenQuickNav={handleOpenQuickNav}
          onOpenSidebar={handleOpenSidebar}
          onOpenAddEvent={handleOpenAddEvent}
          appSwitcher={appSwitcher}
          className="lg:hidden"
        />
      )}

      {/* Main Calendar Content - Embla Carousel */}
      <div
        className={cn(
          "flex-1 overflow-hidden relative w-full h-full",
          className,
        )}
      >
        <div
          className="overflow-hidden h-full"
          ref={emblaRef}
          style={{ touchAction: "pan-y" }}
        >
          <div className="flex h-full">
            {/* Previous */}
            <div
              className="min-w-0 h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:pb-0"
              style={{ flex: "0 0 100%", touchAction: "pan-y" }}
            >
              <MobileEventCalendar
                {...props}
                user={user}
                currentDateOverride={prevDate}
                onSidebarToggle={handleOpenSidebar}
              />
            </div>
            {/* Current */}
            <div
              className="min-w-0 h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:pb-0"
              style={{ flex: "0 0 100%", touchAction: "pan-y" }}
            >
              {children || (
                <MobileEventCalendar
                  {...props}
                  user={user}
                currentDateOverride={currentDate}
                onSidebarToggle={handleOpenSidebar}
                />
              )}
            </div>
            {/* Next */}
            <div
              className="min-w-0 h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:pb-0"
              style={{ flex: "0 0 100%", touchAction: "pan-y" }}
            >
              <MobileEventCalendar
                {...props}
                user={user}
                currentDateOverride={nextDate}
                onSidebarToggle={handleOpenSidebar}
              />
            </div>
          </div>
        </div>
      </div>

      <MobileCalendarOverlays
        getCachedEventsForRange={getCachedEventsForRange}
        isQuickNavOpen={isQuickNavOpen}
        isSidebarOpen={isSidebarOpen}
        onCloseQuickNav={handleCloseQuickNav}
        onCreateEvent={handleOpenAddEvent}
        onLogout={onLogout}
        onOpenCalendarManagement={onOpenCalendarManagement}
        onOpenSearch={handleOpenSearch}
        onOpenSettings={handleOpenSettings}
        onQuickNavOpenChange={setIsQuickNavOpen}
        onSidebarOpenChange={setIsSidebarOpen}
        prefetchRange={prefetchRange}
        user={user}
      />
    </div>
  );
}
