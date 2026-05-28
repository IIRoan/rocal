import {
  CalendarIcon,
  Calendar,
  Sun,
  Moon,
  Monitor,
  Globe,
  Clock,
  Mail,
  Plus,
  Trash2,
  Users,
  Shield,
} from "lucide-react";
import { PRESET_COLOR_OPTIONS } from "@workspace/calendar-core";
import { BASE_SETTINGS_NAVIGATION_ITEMS } from "./base-navigation";

// View labels for breadcrumb display
export const VIEW_LABELS: Record<string, string> = {
  events: "Events",
  calendars: "Calendar Management",
  appearance: "Appearance",
  "time-region": "Time & Region",
  notifications: "Notifications",
  "calendar-defaults": "Calendar Defaults",
  account: "Account",
  security: "Security",
  passkeys: "Passkeys",
  invites: "Invites",
};

// Command types - all actions, no navigation
export type CommandAction = {
  action: string;
  payload?: Record<string, unknown>;
};

export interface Command {
  command: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  execute: CommandAction;
}

// Commands that can be executed with ">" prefix - ALL actions
export const COMMANDS: Command[] = [
  // Event actions
  {
    command: "new event",
    label: "New Event",
    icon: Plus,
    description: "Create a new event",
    execute: { action: "newEvent" },
  },
  // Calendar actions
  {
    command: "new calendar",
    label: "New Calendar",
    icon: Plus,
    description: "Create a new calendar",
    execute: { action: "newCalendar" },
  },
  {
    command: "delete calendar",
    label: "Delete Calendar",
    icon: Trash2,
    description: "Manage and delete calendars",
    execute: { action: "openCalendars" },
  },
  // Theme actions - execute immediately
  {
    command: "dark mode",
    label: "Dark Mode",
    icon: Moon,
    description: "Switch to dark theme",
    execute: { action: "setTheme", payload: { theme: "dark" } },
  },
  {
    command: "light mode",
    label: "Light Mode",
    icon: Sun,
    description: "Switch to light theme",
    execute: { action: "setTheme", payload: { theme: "light" } },
  },
  {
    command: "system theme",
    label: "System Theme",
    icon: Monitor,
    description: "Use system theme",
    execute: { action: "setTheme", payload: { theme: "system" } },
  },
  // Passkey actions
  {
    command: "new passkey",
    label: "New Passkey",
    icon: Plus,
    description: "Add a new passkey",
    execute: { action: "newPasskey" },
  },
  {
    command: "delete passkey",
    label: "Delete Passkey",
    icon: Trash2,
    description: "Remove existing passkeys",
    execute: { action: "openPasskeys" },
  },
];

export const NAVIGATION_ITEMS = [
  {
    id: "events",
    label: "Events",
    icon: CalendarIcon,
    description: "Create an event",
    targetView: "events",
    keywords: ["event", "create event", "new event"],
    parent: null,
  },
  {
    id: "calendars",
    label: "Calendar Management",
    icon: Calendar,
    description: "Create, edit, and delete calendars",
    targetView: "calendars",
    keywords: [
      "calendar",
      "manage calendars",
      "create calendar",
      "subscription",
    ],
    parent: null,
  },
  ...BASE_SETTINGS_NAVIGATION_ITEMS.slice(0, 3),
  {
    id: "calendar-defaults",
    label: "Calendar Defaults",
    icon: Calendar,
    description: "Default event settings",
    targetView: "calendar-defaults",
    keywords: [
      "defaults",
      "working days",
      "week start",
      "first day",
      "calendar defaults",
    ],
    parent: null,
  },
  ...BASE_SETTINGS_NAVIGATION_ITEMS.slice(3),
];

// Expanded search items that include sub-settings with parent info for breadcrumbs
export const SEARCH_INDEX = [
  // Main navigation items
  ...NAVIGATION_ITEMS,
  // Appearance sub-settings
  {
    id: "light-theme",
    label: "Light Theme",
    icon: Sun,
    description: "Switch to light theme",
    targetView: "appearance",
    keywords: ["light", "theme", "light mode", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "dark-theme",
    label: "Dark Theme",
    icon: Moon,
    description: "Switch to dark theme",
    targetView: "appearance",
    keywords: ["dark", "theme", "dark mode", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "system-theme",
    label: "System Theme",
    icon: Monitor,
    description: "Follow system theme",
    targetView: "appearance",
    keywords: ["system", "theme", "auto", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "month-view",
    label: "Month View",
    icon: Calendar,
    description: "Set default view to month",
    targetView: "appearance",
    keywords: ["month", "view", "default view", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "week-view",
    label: "Week View",
    icon: Calendar,
    description: "Set default view to week",
    targetView: "appearance",
    keywords: ["week", "view", "default view", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "day-view",
    label: "Day View",
    icon: Calendar,
    description: "Set default view to day",
    targetView: "appearance",
    keywords: ["day", "view", "default view", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  {
    id: "agenda-view",
    label: "Agenda View",
    icon: Calendar,
    description: "Set default view to agenda",
    targetView: "appearance",
    keywords: ["agenda", "view", "default view", "appearance"],
    parent: "appearance",
    parentLabel: "Appearance",
  },
  // Time & Region sub-settings
  {
    id: "timezone",
    label: "Timezone",
    icon: Globe,
    description: "Set your timezone",
    targetView: "time-region",
    keywords: ["timezone", "time zone", "region", "location"],
    parent: "time-region",
    parentLabel: "Time & Region",
  },
  {
    id: "12h-format",
    label: "12 Hour Format",
    icon: Clock,
    description: "Use 12 hour time format (1:00 PM)",
    targetView: "time-region",
    keywords: ["12 hour", "time format", "am pm"],
    parent: "time-region",
    parentLabel: "Time & Region",
  },
  {
    id: "24h-format",
    label: "24 Hour Format",
    icon: Clock,
    description: "Use 24 hour time format (13:00)",
    targetView: "time-region",
    keywords: ["24 hour", "time format", "military time"],
    parent: "time-region",
    parentLabel: "Time & Region",
  },
  // Notification settings
  {
    id: "email-notifications",
    label: "Email Notifications",
    icon: Mail,
    description: "Enable/disable email notifications",
    targetView: "notifications",
    keywords: ["email", "notification", "alert", "reminder"],
    parent: "notifications",
    parentLabel: "Notifications",
  },
  // Calendar defaults
  {
    id: "week-start",
    label: "First Day of Week",
    icon: Calendar,
    description: "Set which day the week starts on",
    targetView: "calendar-defaults",
    keywords: [
      "week start",
      "first day",
      "sunday",
      "monday",
      "calendar defaults",
    ],
    parent: "calendar-defaults",
    parentLabel: "Calendar Defaults",
  },
  {
    id: "working-days",
    label: "Working Days",
    icon: Calendar,
    description: "Set your working days",
    targetView: "calendar-defaults",
    keywords: [
      "working days",
      "work days",
      "business days",
      "calendar defaults",
    ],
    parent: "calendar-defaults",
    parentLabel: "Calendar Defaults",
  },
  // Security
  {
    id: "passkeys",
    label: "Passkeys",
    icon: Shield,
    description: "Manage passwordless authentication",
    targetView: "security",
    keywords: ["passkey", "security", "authentication", "passwordless"],
    parent: "security",
    parentLabel: "Security",
  },
  // Invites
  {
    id: "invites-search",
    label: "Invites",
    icon: Users,
    description: "Invite friends to join Solace",
    targetView: "invites",
    keywords: ["invite", "invitations", "friends", "share", "referral"],
    parent: "invites",
    parentLabel: "Invites",
  },
];

export interface PresetColor {
  value: string;
  label: string;
}

export const PRESET_COLORS: PresetColor[] = [...PRESET_COLOR_OPTIONS];
