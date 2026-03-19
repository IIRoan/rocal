import type { CalendarEvent, CalendarView, User } from "./types";

export interface SharedMobileEventCalendarProps {
  initialView?: CalendarView;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  events?: CalendarEvent[];
  categories?: any[];
  loading?: boolean;
  eventsLoading?: boolean;
  error?: { message?: string } | null;
  onDateRangeChange?: (dateRange: { start: Date; end: Date }) => void;
  onCreateEvent?: (event: any) => Promise<unknown>;
  onUpdateEvent?: (id: string, event: any) => Promise<unknown>;
  onDeleteEvent?: (id: string) => Promise<void>;
  onCreateCategory?: (category: any) => Promise<unknown>;
  defaultCalendarId?: string | null;
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  showWeekNumbers?: boolean;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  defaultReminder?: number | null;
  defaultEventDuration?: number;
  showHeader?: boolean;
  showViewSwitch?: boolean;
  showCreateButton?: boolean;
  contentInsetBottom?: number;
  themeSettings?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
  onLoadNotifications?: (eventId: string) => Promise<any[]>;
  onUpdateNotifications?: (eventId: string, notifications: any[]) => Promise<void>;
  onEventEdit?: (
    event: any,
    options?: {
      mode?: "modal" | "popover";
      anchorPosition?: { x: number; y: number };
    },
  ) => void;
  onSidebarToggle?: () => void;
  user?: User;
}

export interface SharedMobileCalendarWrapperProps
  extends SharedMobileEventCalendarProps {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenAddEvent?: () => void;
  className?: string;
}

export const sharedMobileViewLabels: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

export function nextMobileCalendarView(view: CalendarView): CalendarView {
  if (view === "day") return "week";
  if (view === "week") return "month";
  if (view === "month") return "agenda";
  return "day";
}

export function parseWorkingDays(value?: string) {
  if (!value) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "number")
      : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}
