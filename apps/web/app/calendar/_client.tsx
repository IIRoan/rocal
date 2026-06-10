"use client";

import { useSession } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { createLogger } from "@workspace/logger";
import dynamic from "next/dynamic";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  SidebarInset,
  SidebarProvider,
  DashboardSkeleton,
  MobileCalendarSkeleton,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import { CommandPaletteProvider } from "@/components/command-palette-context";
import {
  CalendarDataProvider,
  CalendarDateSync,
  useSharedCalendarData,
} from "@/components/calendar-data-provider";
import { CalendarProviderWrapper } from "@/components/calendar-provider-wrapper";
import { SettingsProvider } from "@/components/settings-provider";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import { useCalendarPresentation } from "@/hooks/use-calendar-presentation";
import { useDashboardUserActions } from "@/hooks/use-dashboard-user-actions";
import { useSettings } from "@/hooks/use-settings";
import { calendarApiService } from "@/lib/calendar-api-service";
import { CALENDAR_HOME_PATH } from "@/lib/app-routes";
import {
  useEffect,
  useRef,
  Suspense,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useIsMobile } from "@workspace/ui/hooks";
import { useCalendarUrlSync } from "@/hooks/use-calendar-url-sync";
import { MobileAppSwitcher } from "@/components/mobile-app-switcher";

const log = createLogger("calendar");

const AppSidebar = dynamic(
  () => import("@workspace/ui/components/layout").then((mod) => mod.AppSidebar),
  { ssr: false },
);

const MobileCalendarWrapper = dynamic(
  () =>
    import("@workspace/ui/components").then((mod) => mod.MobileCalendarWrapper),
  {
    ssr: false,
    loading: () => (
      <MobileCalendarLoadingScreen messageContext="CALENDAR_LOAD" />
    ),
  },
);

const CalendarWithData = dynamic(
  () =>
    import("@/components/calendar-with-data").then(
      (mod) => mod.CalendarWithData,
    ),
  { ssr: false },
);

const CommandPalette = dynamic(
  () =>
    import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false },
);

function MobileCalendarLoadingScreen({
  messageContext,
}: {
  messageContext: "CALENDAR_LOAD" | "SETTINGS_LOAD" | "DATA_SYNC";
}) {
  return (
    <>
      <MobileCalendarSkeleton />
      <PageLoadingOverlay
        isLoading={true}
        messageContext={messageContext}
        enableCycling={true}
      />
    </>
  );
}

function CalendarUrlSyncWrapper() {
  useCalendarUrlSync();
  return null;
}

function CalendarSearchParamHandlers({
  onOpenPalette,
}: {
  onOpenPalette: (query?: string) => void;
}) {
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const { openEventEditor } = useCommandPaletteContext();
  const calendarData = useSharedCalendarData();
  const handledEventIdRef = useRef<string | null>(null);
  const handledPaletteRef = useRef<string | null>(null);
  const eventId = searchParams.get("eventId");
  const palette = searchParams.get("palette");

  useEffect(() => {
    if (!eventId || handledEventIdRef.current === eventId) {
      return;
    }

    if (isPending || !session?.user) {
      return;
    }

    let cancelled = false;
    handledEventIdRef.current = eventId;

    const openLinkedEvent = async () => {
      try {
        const existingEvent = calendarData.events.find(
          (event) => event.id === eventId,
        );
        const event =
          existingEvent || (await calendarApiService.getEvent(eventId));

        if (cancelled) {
          return;
        }

        if (event?.start) {
          calendarData.setMonth(new Date(event.start));
        }

        openEventEditor(event, { eventViewMode: "view" });
      } catch (error) {
        log.error("Failed to open event from email link:", error);
      }
    };

    void openLinkedEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId, isPending, session?.user, calendarData, openEventEditor]);

  useEffect(() => {
    if (!palette || handledPaletteRef.current === palette) {
      return;
    }

    if (isPending || !session?.user) {
      return;
    }

    handledPaletteRef.current = palette;
    onOpenPalette(palette === "settings" ? "settings" : "");
  }, [palette, isPending, session?.user, onOpenPalette]);

  return null;
}

function SidebarWithContext() {
  const { data: session } = useSession();
  const {
    openCalendarManagement,
    openPalette,
    openSearchPalette,
    openEventEditor,
  } = useCommandPaletteContext();
  const { settings } = useSettings();
  const calendarData = useSharedCalendarData();
  const { handleLogout, openNewEventEditor } = useDashboardUserActions({
    defaultCalendarId: settings?.defaultCalendarId,
    fallbackCalendarId: calendarData.calendars?.[0]?.id,
    openEventEditor,
  });

  return (
    <AppSidebar
      user={{
        name: session?.user.name || "Unknown User",
        email: session?.user.email || "",
        avatar: session?.user.image || undefined,
      }}
      onLogout={handleLogout}
      onOpenSettings={openPalette}
      onOpenCalendarManagement={openCalendarManagement}
      onOpenSearch={openSearchPalette}
      onCreateEvent={openNewEventEditor}
      getCachedEventsForRange={calendarData.getCachedEventsForRange}
      prefetchRange={calendarData.prefetchRange}
    />
  );
}

function MobileLayoutContent() {
  const { data: session } = useSession();
  const {
    openCalendarManagement,
    openEventEditor,
    openPalette,
    openSearchPalette,
  } =
    useCommandPaletteContext();
  const { isCalendarVisible, currentDate, currentView } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const calendarData = useSharedCalendarData();
  const { handleLogout, openNewEventEditor } = useDashboardUserActions({
    defaultCalendarId: settings?.defaultCalendarId,
    fallbackCalendarId: calendarData.calendars?.[0]?.id,
    openEventEditor,
  });
  const {
    defaultCalendarId,
    initialView,
    isAllInitialLoading,
    overlayContext,
    themeSettings,
    transformedEvents,
    workingDays,
  } = useCalendarPresentation({
    calendarData,
    settings,
    settingsLoading,
    isCalendarVisible,
    currentDate,
    currentView,
    updateTheme: async (theme) => {
      await updateSettings({ theme });
    },
  });

  if (FORCE_LOADING_DESIGN_PREVIEW || isAllInitialLoading) {
    return (
      <MobileCalendarLoadingScreen
        messageContext={overlayContext ?? "CALENDAR_LOAD"}
      />
    );
  }

  return (
    <MobileCalendarWrapper
      user={{
        name: session?.user.name || "Unknown User",
        email: session?.user.email || "",
        avatar: session?.user.image || undefined,
      }}
      onLogout={handleLogout}
      onOpenSettings={() => {
        log.debug("onOpenSettings called - using openPalette");
        openPalette();
      }}
      onOpenCalendarManagement={openCalendarManagement}
      onOpenSearch={openSearchPalette}
      onOpenAddEvent={openNewEventEditor}
      appSwitcher={<MobileAppSwitcher activeApp="calendar" />}
      initialView={initialView}
      events={transformedEvents}
      categories={calendarData.categories}
      loading={false}
      eventsLoading={calendarData.eventsLoading}
      error={calendarData.error}
      onCreateEvent={calendarData.createEvent}
      onUpdateEvent={calendarData.updateEvent}
      onDeleteEvent={calendarData.deleteEvent}
      onCreateCategory={calendarData.createCategory}
      onDateRangeChange={calendarData.setDateRange}
      showWeekNumbers={settings?.showWeekNumbers}
      compactView={settings?.compactView}
      timeFormat={settings?.timeFormat}
      defaultEventDuration={settings?.defaultEventDuration}
      defaultCalendarId={defaultCalendarId}
      weekStartDay={settings?.weekStartDay}
      workingDays={workingDays}
      timezone={settings?.timezone}
      themeSettings={themeSettings}
      onLoadNotifications={calendarData.loadNotifications}
      onUpdateNotifications={calendarData.updateNotifications}
      onEventEdit={openEventEditor}
      getCachedEventsForRange={calendarData.getCachedEventsForRange}
      prefetchRange={calendarData.prefetchRange}
    />
  );
}

export function CalendarPageContent() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isMobile = useIsMobile();

  if (!mounted) {
    return <DashboardSkeleton />;
  }

  return isMobile ? (
    <div className="min-h-[100dvh] safe-area-inset-bottom">
      <MobileLayoutContent />
    </div>
  ) : (
    <CalendarWithData className="h-full min-h-screen flex flex-1" />
  );
}

export function CalendarShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useSmoothRouter();
  const {
    open: commandPaletteOpen,
    setOpen: setCommandPaletteOpen,
    openPalette,
    initialQuery,
  } = useCommandPalette();

  useEffect(() => {
    if (!isPending && !session?.user) {
      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : CALENDAR_HOME_PATH;
      const loginPath = "/login";
      router.startRouteTransition({ messageContext: "AUTH_FLOW" });
      completeAuthNavigation(
        `${loginPath}?next=${encodeURIComponent(currentPath)}`,
      );
    }
  }, [isPending, session?.user, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <DashboardSkeleton />
        <PageLoadingOverlay
          isLoading={true}
          messageContext="AUTH_FLOW"
          enableCycling={true}
          priority
        />
      </>
    );
  }

  return (
    <>
      <SettingsProvider>
        <CalendarDataProvider>
          <CalendarProviderWrapper>
            <CalendarDateSync />
            <CommandPaletteProvider CommandPaletteComponent={CommandPalette}>
              <Suspense fallback={null}>
                <CalendarUrlSyncWrapper />
                <CalendarSearchParamHandlers onOpenPalette={openPalette} />
              </Suspense>

              <SidebarProvider>
                <SidebarWithContext />
                <SidebarInset>{children}</SidebarInset>
              </SidebarProvider>
            </CommandPaletteProvider>

            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
              initialSearchQuery={initialQuery}
            />
          </CalendarProviderWrapper>
        </CalendarDataProvider>
      </SettingsProvider>

      <PageLoadingOverlay
        isLoading={false}
        messageContext="AUTH_FLOW"
        enableCycling={true}
        priority
      />
    </>
  );
}
