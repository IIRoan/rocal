import { redirect } from "next/navigation";
import { buildCalendarPath } from "@/lib/app-routes";

export default function SettingsPage() {
  redirect(buildCalendarPath({ palette: "settings" }));
}
