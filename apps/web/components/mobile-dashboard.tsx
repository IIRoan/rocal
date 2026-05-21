"use client";

import { AppSidebar } from "@workspace/ui/components/layout";
import { MobileCalendarWrapper } from "@workspace/ui/components";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { CalendarWithData } from "@/components/calendar-with-data";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";
import { User } from "@workspace/ui/components/calendar";

interface MobileDashboardProps {
  user: User;
  onLogout: () => void;
}

export function MobileDashboard({ user, onLogout }: MobileDashboardProps) {
  const { openCalendarManagement, openPalette, openEventEditor } =
    useCommandPaletteContext();

  // Get calendar data for mobile wrapper
  const calendarProps = {
    user,
    onLogout,
    onOpenSettings: openPalette,
    onOpenCalendarManagement: openCalendarManagement,
    onOpenAddEvent: () => {
      openEventEditor(createDraftCalendarEvent());
    },
  };

  return (
    <>
      {/* Desktop Layout - Hidden on mobile */}
      <div className="hidden lg:flex h-screen">
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
      <div className="lg:hidden h-screen">
        <MobileCalendarWrapper {...calendarProps} className="h-full" />
      </div>
    </>
  );
}
