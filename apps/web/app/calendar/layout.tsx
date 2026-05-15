import { CalendarShell } from "./_client";

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CalendarShell>{children}</CalendarShell>;
}
