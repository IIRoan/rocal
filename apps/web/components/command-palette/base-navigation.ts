import * as Icons from "lucide-react";
import React from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

const iconSet = Icons as typeof Icons & Record<string, LucideIcon | undefined>;
const FallbackIcon: LucideIcon =
  iconSet.Settings ??
  React.forwardRef<SVGSVGElement, LucideProps>(function FallbackIcon() {
    return null;
  });

export type BasePaletteView =
  | "appearance"
  | "time-region"
  | "notifications"
  | "account"
  | "security"
  | "invites";

export interface BasePaletteNavigationItem {
  id: BasePaletteView;
  label: string;
  icon: LucideIcon;
  description: string;
  targetView: BasePaletteView;
  keywords: string[];
  parent: BasePaletteView | null;
}

export const BASE_SETTINGS_NAVIGATION_ITEMS: BasePaletteNavigationItem[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: iconSet.Palette ?? FallbackIcon,
    description: "Theme and layout settings",
    targetView: "appearance",
    keywords: [
      "theme",
      "dark mode",
      "light mode",
      "appearance",
      "compact",
      "view",
    ],
    parent: null,
  },
  {
    id: "time-region",
    label: "Time & Region",
    icon: iconSet.Globe ?? FallbackIcon,
    description: "Timezone and format preferences",
    targetView: "time-region",
    keywords: ["timezone", "time format", "region", "12 hour", "24 hour"],
    parent: null,
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: iconSet.Bell ?? FallbackIcon,
    description: "Notification preferences",
    targetView: "notifications",
    keywords: ["notification", "email", "reminder", "alert"],
    parent: null,
  },
  {
    id: "account",
    label: "Account",
    icon: iconSet.User ?? FallbackIcon,
    description: "Manage your account and preferences",
    targetView: "account",
    keywords: ["account", "reset", "settings", "delete account"],
    parent: null,
  },
  {
    id: "security",
    label: "Security",
    icon: iconSet.Shield ?? FallbackIcon,
    description: "Security settings",
    targetView: "security",
    keywords: ["security", "passkey", "authentication", "password"],
    parent: "account",
  },
  {
    id: "invites",
    label: "Invites",
    icon: iconSet.Users ?? FallbackIcon,
    description: "Invite friends to join Solace",
    targetView: "invites",
    keywords: ["invite", "invitations", "friends", "share", "referral"],
    parent: "account",
  },
];

export function getBaseSettingsNavigationItems(input: { timezone?: string } = {}) {
  return BASE_SETTINGS_NAVIGATION_ITEMS.map((item) => ({
    ...item,
    description:
      item.id === "time-region" && input.timezone
        ? input.timezone
        : item.description,
  }));
}

export function getRootBaseSettingsNavigationItems(input: {
  timezone?: string;
} = {}) {
  return getBaseSettingsNavigationItems(input).filter((item) => item.parent === null);
}
