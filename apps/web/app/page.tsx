import type { Metadata } from "next";
import { AppSidebar } from "@workspace/ui/components/layout";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";
import { BigCalendar } from "@workspace/ui/components/calendar";

export const metadata: Metadata = {
  title: "Calendar App - Crafted.is",
};

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-1 flex-col gap-4 p-2 pt-0">
          <div className="flex justify-between items-center p-4 bg-white rounded-lg shadow">
            <h1 className="text-2xl font-bold">Calendar App</h1>
            <div className="space-x-2">
              <a
                href="/login"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Login
              </a>
              <a
                href="/dashboard"
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Dashboard
              </a>
            </div>
          </div>
          <BigCalendar />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
