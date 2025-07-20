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
          <BigCalendar />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
