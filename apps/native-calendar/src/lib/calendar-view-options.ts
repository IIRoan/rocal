import type { Feather } from "@expo/vector-icons";
import type { NativeCalendarView } from "./calendar-views";

type FeatherIcon = keyof typeof Feather.glyphMap;

export const VIEW_OPTIONS: {
  label: string;
  value: NativeCalendarView;
  icon: FeatherIcon;
}[] = [
  { label: "Week", value: "week", icon: "columns" },
  { label: "Day", value: "day", icon: "square" },
  { label: "3 Days", value: "3day", icon: "sidebar" },
  { label: "Month", value: "month", icon: "grid" },
  { label: "Agenda", value: "agenda", icon: "list" },
];
