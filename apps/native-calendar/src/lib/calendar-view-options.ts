import type { Feather } from "@expo/vector-icons";
import type { NativeCalendarView } from "./calendar-views";

type FeatherIcon = keyof typeof Feather.glyphMap;

export const VIEW_OPTIONS: {
  label: string;
  value: NativeCalendarView;
  icon: FeatherIcon;
}[] = [
  { label: "Week View", value: "week", icon: "columns" },
  { label: "Day View", value: "day", icon: "square" },
  { label: "3-Day View", value: "3day", icon: "sidebar" },
];
