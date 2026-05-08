import type { MailAddress } from "@/lib/mail/types";

export function formatAddress(
  addresses: MailAddress[] | undefined,
): string {
  const first = addresses?.[0];
  if (!first) return "Unknown";
  return first.name?.trim() || first.email;
}

export function formatAddressFull(
  addresses: MailAddress[] | undefined,
  maxCount = 3,
): string {
  if (!addresses?.length) return "Unknown";
  const formatted = addresses.slice(0, maxCount).map((a) => {
    const name = a.name?.trim();
    return name ? `${name} <${a.email}>` : a.email;
  });
  const rest = addresses.length - maxCount;
  if (rest > 0) formatted.push(`+${rest} more`);
  return formatted.join(", ");
}

export function formatMessageDate(receivedAt: string | undefined): string {
  if (!receivedAt) return "";
  const date = new Date(receivedAt);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
