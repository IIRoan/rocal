import { redirect } from "next/navigation";
import { buildCalendarPath, type RouteSearchParams } from "@/lib/app-routes";

type DashboardPageProps = {
  searchParams?: Promise<RouteSearchParams> | RouteSearchParams;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  redirect(buildCalendarPath(await searchParams));
}
