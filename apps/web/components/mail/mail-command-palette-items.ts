import { Inbox, SquarePen, type LucideIcon } from "lucide-react";
import { getRootBaseSettingsNavigationItems } from "../command-palette/base-navigation";
import { MAIL_SETTINGS_NAV_ITEMS } from "./mail-settings-navigation";

export interface MailPaletteItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

function rootPreferenceItems(timezone?: string): MailPaletteItem[] {
  return getRootBaseSettingsNavigationItems({ timezone }).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    description: item.description,
  }));
}

export function buildMailSearchableItems(timezone?: string): MailPaletteItem[] {
  return [
    {
      id: "compose",
      label: "Compose",
      icon: SquarePen,
      description: "Write a new message",
    },
    ...MAIL_SETTINGS_NAV_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      description: item.description,
    })),
    ...rootPreferenceItems(timezone),
  ];
}

export function buildMailBrowseItems(timezone?: string): MailPaletteItem[] {
  return [
    {
      id: "compose",
      label: "Compose",
      icon: SquarePen,
      description: "Write a new message",
    },
    {
      id: "mail-settings",
      label: "Mail settings",
      icon: Inbox,
      description:
        "Mailboxes, labels, contacts, composing, display, list, shortcuts",
    },
    ...rootPreferenceItems(timezone),
  ];
}

export function filterMailPaletteItems(
  items: MailPaletteItem[],
  query: string,
): MailPaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((item) => {
    if (item.label.toLowerCase().includes(q)) return true;
    if (item.description.toLowerCase().includes(q)) return true;
    const mailItem = MAIL_SETTINGS_NAV_ITEMS.find(
      (entry) => entry.id === item.id,
    );
    return mailItem?.keywords.some((keyword) => keyword.includes(q)) ?? false;
  });
}
