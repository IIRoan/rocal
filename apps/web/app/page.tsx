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
        <BigCalendar />
      </SidebarInset>
    </SidebarProvider>
  );
}
