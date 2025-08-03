"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { AppSidebar } from "@workspace/ui/components/layout";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { CalendarWithData } from "@/components/calendar-with-data";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteProvider } from "@/components/command-palette-context";
import { SettingsProvider } from "@/components/settings-provider";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { useCommandPalette } from "@/hooks/use-command-palette";

function DashboardContent() {
  const { data: session, isPending } = useSession();
  const calendarData = useCalendarData({ autoRefetch: true });
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } =
    useCommandPalette();

  const handleLogout = async () => {
    try {
      await signOut();
      // Redirect to login or home page
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Not authenticated</h1>
          <a
            href="/login"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <SettingsProvider>
      <CalendarProvider
        initialCalendars={calendarData.calendars}
        onCreateCalendar={calendarData.createCalendar}
        onUpdateCalendar={calendarData.updateCalendar}
      >
        <CommandPaletteProvider
          CommandPaletteComponent={CommandPalette}
          onEventSaved={() => {
            console.log("Event saved, triggering calendar refresh");
            // Refresh only events data for faster response (optimistic updates should handle immediate changes)
            calendarData.refetchEvents?.().then(() => {
              console.log("Calendar events refreshed successfully");
            }).catch(error => {
              console.error("Failed to refresh calendar events:", error);
            });
          }}
        >
          <SidebarProvider>
            <AppSidebar
              user={{
                name: session.user.name || "Unknown User",
                email: session.user.email || "",
                avatar: session.user.image || undefined,
              }}
              onLogout={handleLogout}
              onOpenSettings={() => setCommandPaletteOpen(true)}
            />
            <SidebarInset className="overflow-hidden">
              <CalendarWithData />
            </SidebarInset>
          </SidebarProvider>
        </CommandPaletteProvider>
        {/* Keep the original command palette for settings */}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
      </CalendarProvider>
    </SettingsProvider>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
