import type { Metadata } from "next";
import { CalendarPageContent } from "./_client";

export const metadata: Metadata = {
  title: "Calendar – Solace",
  description: "View and manage your calendar in Solace.",
};

export default function CalendarPage() {
  return <CalendarPageContent />;
}
