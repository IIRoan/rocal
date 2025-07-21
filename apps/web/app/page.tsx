import type { Metadata } from "next";
import { AppSidebar } from "@workspace/ui/components/layout";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/ui";

export const metadata: Metadata = {
  title: "Calendar App - Crafted.is",
};

export default function Page() {
  return (
    <SidebarProvider>
      <SidebarInset>Landing Page!</SidebarInset>
    </SidebarProvider>
  );
}
