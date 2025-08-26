"use client";
import { useSession, signOut } from "@/lib/auth-client";
import { AppSidebar } from "@workspace/ui/components/layout";
import { MobileCalendarWrapper } from "@workspace/ui/components";
import { SidebarInset, SidebarProvider, DashboardSkeleton, MobileCalendarSkeleton, PageLoadingOverlay } from "@workspace/ui/components/ui";
import { CalendarWithData } from "@/components/calendar-with-data";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteProvider } from "@/components/command-palette-context";
import { CalendarDataProvider } from "@/components/calendar-data-provider";
import { CalendarProviderWrapper } from "@/components/calendar-provider-wrapper";
import { SettingsProvider } from "@/components/settings-provider";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";
import { useCalendarContext } from "@workspace/ui/components/calendar";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useMemo } from "react";
function SidebarWithContext() {
    const { data: session } = useSession();
    const { openCalendarManagement, openPalette } = useCommandPaletteContext();
    const handleLogout = async () => {
        try {
            await signOut();
            // Redirect to login or home page
            window.location.href = "/";
        }
        catch (error) {
            console.error("Logout failed:", error);
        }
    };
    return (<AppSidebar user={{
            name: session?.user.name || "Unknown User",
            email: session?.user.email || "",
            avatar: session?.user.image || undefined,
        }} onLogout={handleLogout} onOpenSettings={openPalette} onOpenCalendarManagement={openCalendarManagement}/>);
}
function MobileLayoutContent() {
    const { data: session } = useSession();
    const { openCalendarManagement, openEventEditor, openPalette } = useCommandPaletteContext();
    const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();
    // Import calendar data hooks
    const { isCalendarVisible } = useCalendarContext();
    const { settings, loading: settingsLoading, updateSettings } = useSettings();
    const calendarData = useSharedCalendarData();
    const handleLogout = async () => {
        try {
            await signOut();
            window.location.href = "/";
        }
        catch (error) {
            console.error("Logout failed:", error);
        }
    };
    const handleOpenAddEvent = () => {
        const startTime = new Date();
        startTime.setSeconds(0);
        startTime.setMilliseconds(0);
        const newEvent = {
            id: undefined,
            title: "",
            start: startTime,
            end: new Date(startTime.getTime() + 60 * 60 * 1000), // 1 hour default
            allDay: false,
            calendarId: settings?.defaultCalendarId || "",
            userId: "",
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        openEventEditor(newEvent);
    };
    // Create theme settings for the calendar
    const themeSettings = useMemo(() => ({
        currentTheme: (settings?.theme || "system"),
        updateTheme: async (theme) => {
            await updateSettings({ theme });
        },
    }), [settings?.theme, updateSettings]);
    // Optimized event filtering with deep memoization
    const visibleCalendarIds = useMemo(() => {
        return new Set(calendarData.calendars
            .filter((cal) => isCalendarVisible(cal.id))
            .map((cal) => cal.id));
    }, [calendarData.calendars, isCalendarVisible]);
    const transformedEvents = useMemo(() => {
        // Create a map of calendar IDs to calendar objects for quick lookup
        const calendarMap = new Map(calendarData.calendars.map((cal) => [cal.id, cal]));
        const transformedEventsList = calendarData.events
            .filter((event) => visibleCalendarIds.has(event.calendarId)) // O(1) lookup
            .map((event) => {
            // Use event's color if it exists, otherwise fall back to calendar color
            const calendar = calendarMap.get(event.calendarId);
            const eventColor = event.color || calendar?.color || undefined;
            return {
                ...event,
                description: event.description ?? undefined,
                color: eventColor,
                location: event.location ?? undefined,
                categoryId: event.categoryId ?? undefined,
                reminder: event.reminder ?? undefined,
            };
        });
        return transformedEventsList;
    }, [calendarData.events, calendarData.calendars, visibleCalendarIds]);
    // Show mobile calendar skeleton when initial loading
    // Wait for settings and calendar structure (calendars + categories) to be loaded
    // Events can load separately without blocking the UI
    const isInitialLoading = settingsLoading ||
        (calendarData.calendarsLoading && calendarData.calendars.length === 0) ||
        (calendarData.categoriesLoading && calendarData.categories.length === 0);
    const isInitialEventsLoading = calendarData.eventsLoading && calendarData.events.length === 0;
    const isAllInitialLoading = isInitialLoading || isInitialEventsLoading;
    if (isAllInitialLoading) {
        return (<>
        <MobileCalendarSkeleton />
        <PageLoadingOverlay isLoading={true} messageContext={settingsLoading ? "SETTINGS_LOAD" : (isInitialLoading ? "CALENDAR_LOAD" : "DATA_SYNC")} enableCycling={true}/>
      </>);
    }
    return (<MobileCalendarWrapper user={{
            name: session?.user.name || "Unknown User",
            email: session?.user.email || "",
            avatar: session?.user.image || undefined,
        }} onLogout={handleLogout} onOpenSettings={() => {
            console.log('Dashboard onOpenSettings called - using openPalette');
            openPalette();
        }} onOpenCalendarManagement={openCalendarManagement} onOpenAddEvent={handleOpenAddEvent} 
    // Calendar props
    initialView={settings?.defaultView || "month"} events={transformedEvents} categories={calendarData.categories} loading={false} eventsLoading={calendarData.eventsLoading && calendarData.events.length === 0} error={calendarData.error} onCreateEvent={calendarData.createEvent} onUpdateEvent={calendarData.updateEvent} onDeleteEvent={calendarData.deleteEvent} onCreateCategory={calendarData.createCategory} onDateRangeChange={calendarData.setDateRange} showWeekNumbers={settings?.showWeekNumbers} compactView={settings?.compactView} timeFormat={settings?.timeFormat} defaultReminder={settings?.defaultReminder} defaultEventDuration={settings?.defaultEventDuration} defaultCalendarId={settings?.defaultCalendarId} weekStartDay={settings?.weekStartDay} workingDays={settings?.workingDays
            ? JSON.parse(settings.workingDays)
            : [1, 2, 3, 4, 5]} timezone={settings?.timezone} themeSettings={themeSettings} onLoadNotifications={calendarData.loadNotifications} onUpdateNotifications={calendarData.updateNotifications} onEventEdit={openEventEditor}/>);
}
function DashboardContent() {
    const { data: session, isPending } = useSession();
    const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();
    const handleLogout = async () => {
        try {
            await signOut();
            // Redirect to login or home page
            window.location.href = "/";
        }
        catch (error) {
            console.error("Logout failed:", error);
        }
    };
    if (isPending) {
        return (<>
        <DashboardSkeleton />
        <PageLoadingOverlay isLoading={true} messageContext="AUTH_FLOW" enableCycling={true}/>
      </>);
    }
    if (!session?.user) {
        return (<div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Not authenticated</h1>
          <a href="/login" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Go to Login
          </a>
        </div>
      </div>);
    }
    return (<SettingsProvider>
      <CalendarDataProvider>
        <CalendarProviderWrapper>
          <CommandPaletteProvider CommandPaletteComponent={CommandPalette}>
            {/* Mobile Layout */}
            <div className="md:hidden h-screen">
              <MobileLayoutContent />
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:block h-screen">
              <SidebarProvider>
                <SidebarWithContext />
                <SidebarInset>
                  <CalendarWithData />
                </SidebarInset>
              </SidebarProvider>
            </div>
          </CommandPaletteProvider>
          {/* Keep the original command palette for settings */}
          <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}/>
        </CalendarProviderWrapper>
      </CalendarDataProvider>
    </SettingsProvider>);
}
export default function DashboardPage() {
    return <DashboardContent />;
}
