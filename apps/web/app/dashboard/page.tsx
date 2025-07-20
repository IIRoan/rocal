"use client";

import { useSession } from "@/lib/auth-client";
import { AppSidebar } from "@workspace/ui/components/layout";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { CalendarWithData } from "@/components/calendar-with-data";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        {isPending ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-lg">Loading...</div>
          </div>
        ) : !session?.user ? (
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
        ) : (
          <CalendarWithData initialView="month" />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
