import {
  AlignLeft,
  Eye,
  Inbox,
  ListFilter,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export type MailSettingsView =
  | "mailboxes"
  | "labels"
  | "contacts"
  | "composing"
  | "mail-display"
  | "mail-list";

export interface MailSettingsNavItem {
  id: MailSettingsView;
  label: string;
  icon: LucideIcon;
  description: string;
  keywords: string[];
}

export const MAIL_SETTINGS_NAV_ITEMS: MailSettingsNavItem[] = [
  {
    id: "mailboxes",
    label: "Mailboxes",
    icon: Inbox,
    description: "Create, edit, and delete mailboxes",
    keywords: ["mailbox", "folder", "inbox", "archive"],
  },
  {
    id: "labels",
    label: "Labels",
    icon: Tag,
    description: "Manage message labels",
    keywords: ["label", "tag", "keyword"],
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: Users,
    description: "People you email and receive mail from",
    keywords: ["contact", "address", "recipient", "people"],
  },
  {
    id: "composing",
    label: "Composing",
    icon: AlignLeft,
    description: "Plain text mode, signatures, attachment reminders",
    keywords: ["compose", "signature", "reply", "attachment"],
  },
  {
    id: "mail-display",
    label: "Content & display",
    icon: Eye,
    description: "Remote images, trusted senders, reading appearance",
    keywords: [
      "display",
      "images",
      "trusted",
      "sender",
      "privacy",
      "tracking",
      "dark mode",
      "appearance",
    ],
  },
  {
    id: "mail-list",
    label: "List & shortcuts",
    icon: ListFilter,
    description: "Density, mark-as-read delay, undo toasts, keyboard shortcuts",
    keywords: [
      "list",
      "density",
      "compact",
      "comfortable",
      "keyboard",
      "shortcuts",
      "undo",
      "mark as read",
      "thread",
      "expand",
    ],
  },
];

export function filterMailSettingsNavItems(query: string): MailSettingsNavItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return MAIL_SETTINGS_NAV_ITEMS;

  return MAIL_SETTINGS_NAV_ITEMS.filter((item) => {
    if (item.label.toLowerCase().includes(normalized)) return true;
    if (item.description.toLowerCase().includes(normalized)) return true;
    return item.keywords.some((keyword) => keyword.includes(normalized));
  });
}
