"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { createLogger } from "@workspace/logger";
import dynamic from "next/dynamic";
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
  useSharedCalendarData,
} from "@/components/calendar-data-provider";
import { CalendarProviderWrapper } from "@/components/calendar-provider-wrapper";
import { SettingsProvider } from "@/components/settings-provider";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import { useSettings } from "@/hooks/use-settings";
import { calendarApiService } from "@/lib/calendar-api-service";
import { getApiBaseUrl } from "@/lib/api-url";
import { buildViewPrefetchRanges } from "@/hooks/use-calendar-events-loader";
import {
  useMemo,
  useEffect,
  useState,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { useCalendarUrlSync } from "@/hooks/use-calendar-url-sync";

const log = createLogger("dashboard");

const AppSidebar = dynamic(
  () => import("@workspace/ui/components/layout").then((mod) => mod.AppSidebar),
  { ssr: false },
);

const MobileCalendarWrapper = dynamic(
  () =>
    import("@workspace/ui/components").then((mod) => mod.MobileCalendarWrapper),
  { ssr: false, loading: () => <MobileCalendarSkeleton /> },
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

type CalendarAssistantResponse = {
  reply: string;
  createdEvent: {
    id: string;
    title: string;
    description?: string | null;
    start: string;
    end: string;
    allDay?: boolean;
    location?: string | null;
    calendarId: string;
  } | null;
  updatedEvent: {
    id: string;
    title: string;
    description?: string | null;
    start: string;
    end: string;
    allDay?: boolean;
    location?: string | null;
    calendarId: string;
  } | null;
  deletedEventId: string | null;
  events?: Array<{
    id: string;
    title: string;
    description?: string | null;
    start: string;
    end: string;
    allDay?: boolean;
    location?: string | null;
    calendarId: string;
  }>;
  error?: string;
};

function DashboardLoadingScreen() {
  return (
    <>
      <DashboardSkeleton />
      <PageLoadingOverlay
        isLoading={true}
        messageContext="AUTH_FLOW"
        enableCycling={true}
      />
    </>
  );
}

function CalendarUrlSyncWrapper() {
  useCalendarUrlSync();
  return null;
}

function DashboardSearchParamHandlers({
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
          calendarData.setDateRange({
            start: event.start,
            end: event.end,
          });
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
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      log.error("Logout failed:", error);
    }
  };

  const handleCreateEvent = () => {
    const startTime = new Date();
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent = {
      id: undefined as any,
      title: "",
      start: startTime,
      end: new Date(startTime.getTime() + 60 * 60 * 1000),
      allDay: false,
      calendarId:
        settings?.defaultCalendarId || calendarData.calendars?.[0]?.id || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    openEventEditor(newEvent);
  };

  const handleAiSubmit = async () => {
    const query = aiQuery.trim();
    if (!query || aiLoading) {
      return;
    }

    setAiLoading(true);
    setAiResponse("");

    try {
      const assistantUrl = `${getApiBaseUrl()}/api/calendar-assistant`;
      const response = await fetch(assistantUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          timezone:
            settings?.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          now: new Date().toISOString(),
        }),
      });

      const responseText = await response.text();
      let data: CalendarAssistantResponse;

      try {
        data = JSON.parse(responseText) as CalendarAssistantResponse;
      } catch (parseError) {
        log.error("Failed to parse AI response:", parseError);
        log.error("Response text:", responseText);
        throw new Error("I received an invalid response. Please try again.");
      }

      if (!response.ok) {
        throw new Error(
          data?.reply || data?.error || "Calendar assistant request failed",
        );
      }

      if (data.createdEvent || data.updatedEvent || data.deletedEventId) {
        await calendarData.refetch();
      }

      setAiResponse(data.reply);
      setAiQuery("");
    } catch (error: any) {
      setAiResponse(
        error?.message ||
          "I can only help with calendar event actions and calendar event info.",
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <AppSidebar
      user={{
        name: session?.user.name || "Unknown User",
        email: session?.user.email || "",
        avatar: session?.user.image || undefined,
        hasAiAccess: !!(session?.user as any)?.hasAiAccess,
      }}
      onLogout={handleLogout}
      onOpenSettings={openPalette}
      onOpenCalendarManagement={openCalendarManagement}
      onOpenSearch={openSearchPalette}
      onCreateEvent={handleCreateEvent}
      getCachedEventsForRange={calendarData.getCachedEventsForRange}
      prefetchRange={calendarData.prefetchRange}
    />
  );
}

function MobileLayoutContent() {
  const { data: session } = useSession();
  const { openCalendarManagement, openEventEditor, openPalette } =
    useCommandPaletteContext();
  const { isCalendarVisible, currentDate, currentView } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const calendarData = useSharedCalendarData();
  const { prefetchRange } = calendarData;

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      log.error("Logout failed:", error);
    }
  };

  const handleOpenAddEvent = () => {
    const startTime = new Date();
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    const newEvent = {
      id: undefined as any,
      title: "",
      start: startTime,
      end: new Date(startTime.getTime() + 60 * 60 * 1000),
      allDay: false,
      calendarId: settings?.defaultCalendarId || "",
      userId: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    openEventEditor(newEvent);
  };

  const themeSettings = useMemo(
    () => ({
      currentTheme: (settings?.theme || "system") as
        | "light"
        | "dark"
        | "system",
      updateTheme: async (theme: "light" | "dark" | "system") => {
        await updateSettings({ theme });
      },
    }),
    [settings?.theme, updateSettings],
  );

  const visibleCalendarIds = useMemo(() => {
    return new Set(
      calendarData.calendars
        .filter((cal) => isCalendarVisible(cal.id))
        .map((cal) => cal.id),
    );
  }, [calendarData.calendars, isCalendarVisible]);

  const transformedEvents = useMemo(() => {
    const calendarMap = new Map(
      calendarData.calendars.map((cal) => [cal.id, cal]),
    );

    return calendarData.events
      .filter((event) => visibleCalendarIds.has(event.calendarId))
      .map((event) => {
        const calendar = calendarMap.get(event.calendarId);
        const eventColor = event.color || calendar?.color || undefined;

        return {
          ...event,
          description: event.description ?? undefined,
          color: eventColor as any,
          location: event.location ?? undefined,
          categoryId: event.categoryId ?? undefined,
          reminder: (event as any).reminder ?? undefined,
        };
      });
  }, [calendarData.events, calendarData.calendars, visibleCalendarIds]);

  useEffect(() => {
    if (!currentDate || !currentView) {
      return;
    }

    const ranges = buildViewPrefetchRanges(currentDate, currentView);
    const eagerRanges = ranges.slice(0, 2);
    const deferredRanges = ranges.slice(2);

    for (const range of eagerRanges) {
      prefetchRange(range);
    }

    if (deferredRanges.length === 0) {
      return;
    }

    const runDeferredPrefetch = () => {
      for (const range of deferredRanges) {
        prefetchRange(range);
      }
    };

    if ("requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(runDeferredPrefetch, {
        timeout: 400,
      });
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as any).cancelIdleCallback(id);
        }
      };
    }

    const id = setTimeout(runDeferredPrefetch, 32);
    return () => clearTimeout(id);
  }, [currentDate, currentView, prefetchRange]);

  const isInitialLoading =
    settingsLoading ||
    (calendarData.calendarsLoading && calendarData.calendars.length === 0) ||
    (calendarData.categoriesLoading && calendarData.categories.length === 0);

  const isInitialEventsLoading =
    calendarData.eventsLoading && calendarData.events.length === 0;
  const isAllInitialLoading = isInitialLoading || isInitialEventsLoading;

  if (FORCE_LOADING_DESIGN_PREVIEW || isAllInitialLoading) {
    return (
      <>
        <MobileCalendarSkeleton />
        <PageLoadingOverlay
          isLoading={true}
          messageContext={
            settingsLoading
              ? "SETTINGS_LOAD"
              : isInitialLoading
                ? "CALENDAR_LOAD"
                : "DATA_SYNC"
          }
          enableCycling={true}
        />
      </>
    );
  }

  return (
    <MobileCalendarWrapper
      user={{
        name: session?.user.name || "Unknown User",
        email: session?.user.email || "",
        avatar: session?.user.image || undefined,
        hasAiAccess: !!(session?.user as any)?.hasAiAccess,
      }}
      onLogout={handleLogout}
      onOpenSettings={() => {
        log.debug("onOpenSettings called - using openPalette");
        openPalette();
      }}
      onOpenCalendarManagement={openCalendarManagement}
      onOpenAddEvent={handleOpenAddEvent}
      initialView={settings?.defaultView || "month"}
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
      defaultReminder={settings?.defaultReminder}
      defaultEventDuration={settings?.defaultEventDuration}
      defaultCalendarId={settings?.defaultCalendarId}
      weekStartDay={settings?.weekStartDay}
      workingDays={
        settings?.workingDays
          ? JSON.parse(settings.workingDays)
          : [1, 2, 3, 4, 5]
      }
      timezone={settings?.timezone}
      themeSettings={themeSettings}
      onLoadNotifications={calendarData.loadNotifications}
      onUpdateNotifications={calendarData.updateNotifications}
      onEventEdit={openEventEditor}
      getCachedEventsForRange={calendarData.getCachedEventsForRange}
      prefetchRange={prefetchRange}
    />
  );
}

export function DashboardPageContent() {
  return (
    <>
      <div className="md:hidden min-h-[100dvh] safe-area-inset-top safe-area-inset-bottom">
        <MobileLayoutContent />
      </div>

      <CalendarWithData className="hidden h-full min-h-screen md:flex md:flex-1" />
    </>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
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
          : "/dashboard";
      const loginPath =
        typeof window !== "undefined" &&
        (window as any).Capacitor?.isNativePlatform?.()
          ? "/mobile-login"
          : "/login";
      router.replace(`${loginPath}?next=${encodeURIComponent(currentPath)}`);
    }
  }, [isPending, session?.user, router]);

  if (isPending || !session?.user) {
    return <DashboardLoadingScreen />;
  }

  return (
    <SettingsProvider>
      <CalendarDataProvider>
        <CalendarProviderWrapper>
          <CommandPaletteProvider CommandPaletteComponent={CommandPalette}>
            <Suspense fallback={null}>
              <CalendarUrlSyncWrapper />
              <DashboardSearchParamHandlers onOpenPalette={openPalette} />
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
  );
}
