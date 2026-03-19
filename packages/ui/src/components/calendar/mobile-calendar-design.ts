import type { CalendarEvent, CalendarView, User } from "./types";

export const mobileCalendarTokens = {
  colors: {
    background: "#f4f7fb",
    backgroundOverlay: "rgba(244,247,251,0.94)",
    surface: "#ffffff",
    surfaceElevated: "rgba(255,255,255,0.96)",
    surfaceMuted: "#e8eef5",
    surfaceAccent: "#eff6ff",
    border: "#dbe4f0",
    borderSoft: "rgba(219,228,240,0.5)",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#475569",
    textOnPrimary: "#f8fafc",
    primary: "#0f172a",
    primarySoft: "rgba(15,23,42,0.08)",
    accent: "#0f766e",
    accentStrong: "#2563eb",
    overlay: "rgba(15,23,42,0.22)",
    danger: "#dc2626",
  },
  radius: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    pill: 999,
    nav: 24,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    eyebrow: { size: 11, weight: "700" as const, letterSpacing: 0.8 },
    title: { size: 22, weight: "700" as const },
    sectionTitle: { size: 12, weight: "700" as const, letterSpacing: 0.7 },
    body: { size: 13, weight: "700" as const },
    heading: { size: 16, weight: "700" as const },
  },
  sizes: {
    iconButton: 40,
    miniIconButton: 28,
    fab: 52,
    bottomBarMinHeight: 44,
    dayStripItemWidth: 56,
    dayPillWidth: 68,
  },
  shadow: {
    color: "#0f172a",
    opacity: 0.04,
    radius: 6,
    offsetY: 2,
    elevation: 1,
  },
} as const;

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
