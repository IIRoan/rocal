import { Feather } from "@expo/vector-icons";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemePreference } from "../providers/ThemeProvider";

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

export const THEME_OPTIONS: {
  label: string;
  value: ThemePreference;
  icon: FeatherIcon;
}[] = [
  { label: "Light", value: "light", icon: "sun" },
  { label: "Dark", value: "dark", icon: "moon" },
  { label: "System", value: "system", icon: "monitor" },
];

export const VIEW_OPTIONS: {
  label: string;
  value: CalendarView;
  icon: FeatherIcon;
}[] = [
  { label: "Month View", value: "month", icon: "grid" },
  { label: "Week View", value: "week", icon: "columns" },
  { label: "Day View", value: "day", icon: "square" },
  { label: "3-Day View", value: "3day", icon: "sidebar" },
  { label: "Agenda View", value: "agenda", icon: "list" },
];

export const WEEK_START_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
];

export const TIME_FORMAT_OPTIONS: {
  label: string;
  value: "12h" | "24h";
}[] = [
  { label: "12 Hour (1:00 PM)", value: "12h" },
  { label: "24 Hour (13:00)", value: "24h" },
];

export const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];
