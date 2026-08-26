import type { PaletteView } from "./constants";

const PARENT_CHAINS: Partial<Record<PaletteView, PaletteView[]>> = {
  appearance: ["main"],
  "time-region": ["main"],
  timezone: ["main", "time-region"],
  notifications: ["main"],
  "calendar-defaults": ["main"],
  account: ["main"],
  security: ["main"],
  passkeys: ["main", "security"],
  calendars: ["main"],
  "calendar-create": ["main", "calendars"],
  "calendar-edit": ["main", "calendars"],
  subscriptions: ["main"],
  "subscriptions-add-feed": ["main", "subscriptions"],
  "subscriptions-holidays": ["main", "subscriptions"],
  "subscriptions-edit": ["main", "subscriptions"],
  events: ["main"],
  "event-editor": ["main"],
  invites: ["main"],
  search: ["main"],
};

export function buildInitialHistory(view: PaletteView): PaletteView[] {
  if (view === "main") return ["main"];
  const parents = PARENT_CHAINS[view];
  return parents ? [...parents, view] : ["main", view];
}

export function getDialogTitle(currentView: PaletteView): string {
  switch (currentView) {
    case "main":
      return "Command Palette";
    case "search":
      return "Search Mail and Calendar";
    case "appearance":
      return "Appearance Settings";
    case "notifications":
      return "Notification Settings";
    case "time-region":
      return "Time & Region Settings";
    case "timezone":
      return "Timezone Selection";
    case "calendar-defaults":
      return "Calendar Defaults";
    case "account":
      return "Account Settings";
    case "security":
      return "Security";
    case "passkeys":
      return "Passkeys";
    case "invites":
      return "Invites";
    case "calendars":
      return "Calendar Management";
    case "calendar-create":
      return "Create Calendar";
    case "calendar-edit":
      return "Edit Calendar";
    case "subscriptions":
      return "Calendar Subscriptions";
    case "subscriptions-add-feed":
      return "Add External Feed";
    case "subscriptions-holidays":
      return "Holiday Calendars";
    case "subscriptions-edit":
      return "Edit Calendar";
    case "events":
      return "New Event";
    default:
      return "Settings";
  }
}
