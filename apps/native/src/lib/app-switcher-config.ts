import type { Feather } from "@expo/vector-icons";
import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
} from "./navigation-routes";

export type AppSwitchKey = "calendar" | "mail";

export type AppSwitchOption = {
  key: AppSwitchKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href: string;
};

export const APP_SWITCH_OPTIONS: AppSwitchOption[] = [
  {
    key: "calendar",
    label: "Calendar",
    icon: "calendar",
    href: CALENDAR_TAB_ROUTE,
  },
  {
    key: "mail",
    label: "Mail",
    icon: "mail",
    href: MAIL_TAB_ROUTE,
  },
];

export function getAppSwitchOption(key: AppSwitchKey): AppSwitchOption {
  const option = APP_SWITCH_OPTIONS.find((entry) => entry.key === key);
  if (!option) {
    throw new Error(`Unknown app switch key: ${key}`);
  }
  return option;
}
