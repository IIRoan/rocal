import { CalendarIcon, Calendar, Palette, Globe, Bell, User, Shield, } from "lucide-react";
export const NAVIGATION_ITEMS = [
    {
        id: "events",
        label: "Events",
        icon: CalendarIcon,
        description: "Create and manage events",
    },
    {
        id: "calendars",
        label: "Calendar Management",
        icon: Calendar,
        description: "Create, edit, and delete calendars",
    },
    {
        id: "appearance",
        label: "Appearance",
        icon: Palette,
        description: "Theme and layout settings",
    },
    {
        id: "time-region",
        label: "Time & Region",
        icon: Globe,
        description: "Timezone and format preferences",
    },
    {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        description: "Notification preferences",
    },
    {
        id: "calendar-defaults",
        label: "Calendar Defaults",
        icon: Calendar,
        description: "Default event settings",
    },
    {
        id: "account",
        label: "Account",
        icon: User,
        description: "Account information",
    },
    {
        id: "security",
        label: "Security",
        icon: Shield,
        description: "Security settings",
    },
];
export const PRESET_COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#f43f5e",
    "#ef4444",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
    "#ec4899",
    "#14b8a6",
];
