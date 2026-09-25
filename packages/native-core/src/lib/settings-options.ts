import { Feather } from "@expo/vector-icons";
import type { TimeFormat } from "@workspace/calendar-core";
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

export const WEEK_START_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
];

export const TIME_FORMAT_OPTIONS: {
  label: string;
  value: TimeFormat;
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
