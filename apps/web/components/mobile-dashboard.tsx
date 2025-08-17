"use client";

import { AppSidebar } from "@workspace/ui/components/layout";
import { MobileCalendarWrapper } from "@workspace/ui/components";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { CalendarWithData } from "@/components/calendar-with-data";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";
import { useCalendarContext } from "@workspace/ui/components/calendar";

interface MobileDashboardProps {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout: () => void;
}

export function MobileDashboard({ user, onLogout }: MobileDashboardProps) {
  const { openCalendarManagement, openPalette, openEventEditor } = useCommandPaletteContext();

  // Get calendar data for mobile wrapper
  const calendarProps = {
    user,
    onLogout,
    onOpenSettings: openPalette,
    onOpenCalendarManagement: openCalendarManagement,
    onOpenAddEvent: () => {
      // Create a new event starting at current time
      const startTime = new Date();
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
      
      const newEvent = {
        id: undefined,
        title: "",
        start: startTime,
        end: new Date(startTime.getTime() + 60 * 60 * 1000), // 1 hour default
        allDay: false,
        calendarId: "",
        userId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      openEventEditor(newEvent);
    },
  };

  return (
    <>
      {/* Desktop Layout - Hidden on mobile */}
      <div className="hidden md:flex h-screen">
        <SidebarProvider>
          <AppSidebar
            user={user}
            onLogout={onLogout}
            onOpenSettings={openPalette}
            onOpenCalendarManagement={openCalendarManagement}
          />
          <SidebarInset>
            <CalendarWithData />
          </SidebarInset>
        </SidebarProvider>
      </div>

      {/* Mobile Layout - Hidden on desktop */}
      <div className="md:hidden h-screen">
        <MobileCalendarWrapper
          {...calendarProps}
          className="h-full"
        />
      </div>
    </>
  );
}