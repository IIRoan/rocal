"use client";

import React, { useRef, useMemo, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { createGesture, createAnimation } from "@ionic/core";
import {
  MobileEventCalendar,
  MobileEventCalendarProps,
} from "./mobile-event-calendar";
import { MobileBottomNav } from "../navigation/mobile-bottom-nav";
import { MobileTopNav } from "../navigation/mobile-top-nav";
import { MobileDayStrip } from "./mobile-day-strip";
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
import { Plus } from "lucide-react";
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
  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const slidesContainerRef = useRef<HTMLDivElement>(null);
  const slideWidthRef = useRef(0);
  const isCarouselAnimatingRef = useRef(false);
  const isSidebarOpenRef = useRef(false);

  const { currentDate, setCurrentDate, currentView, setCurrentView } =
    useCalendarContext();

  // Initialize context view from props on first render
  React.useEffect(() => {
    if (
      currentView === "month" &&
      props.initialView &&
      props.initialView !== "month"
    ) {
      // Check sessionStorage first
      if (typeof window !== "undefined") {
        const savedViewData = sessionStorage.getItem("calendar-view-selection");
        if (savedViewData) {
          try {
            const parsedData = JSON.parse(savedViewData);
            if (
              parsedData.expires &&
              parsedData.expires > Date.now() &&
              (CALENDAR_VIEWS as readonly string[]).includes(parsedData.view)
            ) {
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

  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen;
  }, [isSidebarOpen]);

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
      sessionStorage.setItem(
        "calendar-view-selection",
        JSON.stringify(viewData),
      );
    }
  };
  const handleCalendarViewChange = handleViewChange;

  const handlePrevious = useCallback(() => {
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
  }, [currentDate, currentView, setCurrentDate]);

  const handleNext = useCallback(() => {
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
  }, [currentDate, currentView, setCurrentDate]);

  // Date helpers for adjacent slides
  const getNextDate = useCallback(
    (date: Date) => {
      switch (currentView) {
        case "day":
          return addDays(date, 1);
        case "3day":
          return addDays(date, 3);
        case "week":
          return addWeeks(date, 1);
        case "month":
          return addMonths(date, 1);
        case "agenda":
          return addDays(date, AgendaDaysToShow);
        default:
          return addWeeks(date, 1);
      }
    },
    [currentView],
  );

  const getPrevDate = useCallback(
    (date: Date) => {
      switch (currentView) {
        case "day":
          return subDays(date, 1);
        case "3day":
          return subDays(date, 3);
        case "week":
          return subWeeks(date, 1);
        case "month":
          return subMonths(date, 1);
        case "agenda":
          return subDays(date, AgendaDaysToShow);
        default:
          return subWeeks(date, 1);
      }
    },
    [currentView],
  );

  const prevDate = useMemo(
    () => getPrevDate(currentDate),
    [currentDate, getPrevDate],
  );
  const nextDate = useMemo(
    () => getNextDate(currentDate),
    [currentDate, getNextDate],
  );

  useEffect(() => {
    const measure = () => {
      if (!carouselViewportRef.current || !slidesContainerRef.current) return;
      const width = carouselViewportRef.current.offsetWidth;
      slideWidthRef.current = width;
      slidesContainerRef.current.style.transform = `translateX(${-width}px)`;
    };

    measure();
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
    };
  }, []);

  const snapAndNavigate = useCallback(
    (direction: "next" | "prev" | "center", fromTranslate: number) => {
      const wrapper = slidesContainerRef.current;
      if (!wrapper) return;

      const slideWidth = slideWidthRef.current;

      isCarouselAnimatingRef.current = true;

      const targetTranslate =
        direction === "next"
          ? -slideWidth * 2
          : direction === "prev"
            ? 0
            : -slideWidth;

      const easing =
        direction === "center"
          ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
          : "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

      const duration = direction === "center" ? 220 : 280;

      const animation = createAnimation()
        .addElement(wrapper)
        .duration(duration)
        .easing(easing)
        .fromTo(
          "transform",
          `translateX(${fromTranslate}px)`,
          `translateX(${targetTranslate}px)`,
        );

      void animation.play().then(() => {
        if (direction === "next") {
          if (Capacitor.isNativePlatform()) {
            void Haptics.impact({ style: ImpactStyle.Light }).catch(
              () => undefined,
            );
          }
          handleNext();
        } else if (direction === "prev") {
          if (Capacitor.isNativePlatform()) {
            void Haptics.impact({ style: ImpactStyle.Light }).catch(
              () => undefined,
            );
          }
          handlePrevious();
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (slidesContainerRef.current) {
              slidesContainerRef.current.style.transform = `translateX(${-slideWidthRef.current}px)`;
            }
            isCarouselAnimatingRef.current = false;
          });
        });
      });
    },
    [handleNext, handlePrevious],
  );

  useEffect(() => {
    const viewport = carouselViewportRef.current;
    const wrapper = slidesContainerRef.current;

    if (!viewport || !wrapper) return;

    const gesture = createGesture({
      el: viewport,
      gestureName: "calendar-date-swipe",
      direction: "x",
      threshold: 0,
      gesturePriority: 20,
      canStart: (detail) => {
        if (isCarouselAnimatingRef.current) return false;
        if (isSidebarOpenRef.current) return false;
        if (detail.startX <= 60 && detail.deltaX > 0) return false;
        return true;
      },
      onStart: () => {
        wrapper.style.transition = "none";
      },
      onMove: (detail) => {
        if (isCarouselAnimatingRef.current) return;

        const slideWidth = slideWidthRef.current;
        let translateX = -slideWidth + detail.deltaX;

        const maxOvershoot = slideWidth * 0.4;
        if (detail.deltaX > 0) {
          translateX = -slideWidth + Math.min(detail.deltaX, maxOvershoot);
        } else if (-detail.deltaX > slideWidth) {
          translateX =
            -slideWidth * 2 + Math.max(0, -detail.deltaX - slideWidth) * -0.4;
        }

        wrapper.style.transform = `translateX(${translateX}px)`;
      },
      onEnd: (detail) => {
        if (isCarouselAnimatingRef.current) return;

        const slideWidth = slideWidthRef.current;
        const threshold = slideWidth * 0.25;
        const velocity = 0.3;

        const currentTranslate = -slideWidth + detail.deltaX;
        const clampedTranslate = Math.max(
          -slideWidth * 2,
          Math.min(0, currentTranslate),
        );

        const goNext =
          detail.deltaX < -threshold || detail.velocityX < -velocity;
        const goPrev = detail.deltaX > threshold || detail.velocityX > velocity;

        snapAndNavigate(
          goNext ? "next" : goPrev ? "prev" : "center",
          clampedTranslate,
        );
      },
    });

    gesture.enable(true);

    return () => {
      gesture.destroy();
    };
  }, [snapAndNavigate]);

  return (
    <div
      ref={mainContainerRef}
      className="relative flex flex-col h-dvh md:h-full overflow-hidden"
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

      {/* Day Strip — shown for day and 3-day views */}
      {isMobile && (currentView === "day" || currentView === "3day") && (
        <MobileDayStrip
          events={props.events}
          weekStartDay={props.weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
        />
      )}

      {/* Main Calendar Content — native gesture carousel */}
      <div
        ref={carouselViewportRef}
        className={cn(
          "flex-1 overflow-hidden relative w-full h-full",
          className,
        )}
      >
        <div
          ref={slidesContainerRef}
          className="flex h-full"
          style={{
            width: "300%",
            willChange: "transform",
          }}
        >
          <div
            className="overflow-y-auto"
            style={{
              flex: "0 0 33.333%",
              height: "100%",
              paddingBottom: "80px",
              touchAction: "pan-y",
            }}
          >
            <MobileEventCalendar
              {...props}
              user={user}
              initialView={currentView}
              currentDateOverride={prevDate}
              onSidebarToggle={handleOpenSidebar}
              onViewChange={handleCalendarViewChange}
            />
          </div>

          <div
            className="overflow-y-auto"
            style={{
              flex: "0 0 33.333%",
              height: "100%",
              paddingBottom: "80px",
              touchAction: "pan-y",
            }}
          >
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

          <div
            className="overflow-y-auto"
            style={{
              flex: "0 0 33.333%",
              height: "100%",
              paddingBottom: "80px",
              touchAction: "pan-y",
            }}
          >
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

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        currentView={currentView}
        onViewChange={handleViewChange}
        className="md:hidden"
      />

      {/* Floating Action Button - create new event */}
      {isMobile && !isSidebarOpen && (
        <button
          onClick={handleOpenAddEvent}
          className="fixed z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-90 transition-transform touch-manipulation md:hidden"
          style={{
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 16px)",
            right: "16px",
          }}
          aria-label="Add new event"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

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
