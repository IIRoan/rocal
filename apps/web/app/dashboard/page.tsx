"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { AppSidebar } from "@workspace/ui/components/layout";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { CalendarWithData } from "@/components/calendar-with-data";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteProvider } from "@/components/command-palette-context";
import { CalendarDataProvider } from "@/components/calendar-data-provider";
import { CalendarProviderWrapper } from "@/components/calendar-provider-wrapper";
import { SettingsProvider } from "@/components/settings-provider";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useCommandPalette as useCommandPaletteContext } from "@/components/command-palette-context";

function SidebarWithContext() {
  const { data: session } = useSession();
  const { openCalendarManagement } = useCommandPaletteContext();

  const handleLogout = async () => {
    try {
      await signOut();
      // Redirect to login or home page
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AppSidebar
      user={{
        name: session?.user.name || "Unknown User",
        email: session?.user.email || "",
        avatar: session?.user.image || undefined,
      }}
      onLogout={handleLogout}
      onOpenSettings={() => {}} // We'll handle this through the context now
      onOpenCalendarManagement={openCalendarManagement}
    />
  );
}

function DashboardContent() {
  const { data: session, isPending } = useSession();
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
      <CalendarDataProvider>
        <CalendarProviderWrapper>
          <CommandPaletteProvider CommandPaletteComponent={CommandPalette}>
            <SidebarProvider>
              <SidebarWithContext />
              <SidebarInset>
                <CalendarWithData />
              </SidebarInset>
            </SidebarProvider>
          </CommandPaletteProvider>
          {/* Keep the original command palette for settings */}
          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
        </CalendarProviderWrapper>
      </CalendarDataProvider>
    </SettingsProvider>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
