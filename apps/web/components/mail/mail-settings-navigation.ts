import {
  AlignLeft,
  Eye,
  FileText,
  Inbox,
  ListFilter,
  Reply,
  Signature,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export type MailSettingsView =
  | "mailboxes"
  | "labels"
  | "contacts"
  | "composing"
  | "templates"
  | "signatures"
  | "mail-display"
  | "mail-list"
  | "auto-reply";

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
    description: "Create, edit, hide, and delete mailboxes",
    keywords: ["mailbox", "folder", "inbox", "archive", "hide", "show", "hidden"],
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
    keywords: ["compose", "signature", "reply", "attachment", "photo", "location", "metadata", "undo send", "schedule", "send later"],
  },
  {
    id: "templates",
    label: "Templates",
    icon: FileText,
    description: "Saved replies to insert while you write",
    keywords: ["template", "canned", "saved reply", "snippet", "quick text", "boilerplate"],
  },
  {
    id: "signatures",
    label: "Signatures",
    icon: Signature,
    description: "Sign-offs for new messages and replies",
    keywords: ["signature", "sign-off", "sign off", "footer", "default signature"],
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
      "advance",
    ],
  },
  {
    id: "auto-reply",
    label: "Auto-reply",
    icon: Reply,
    description: "Reply automatically while you're away",
    keywords: ["vacation", "away", "out of office", "auto reply", "autoresponder"],
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
