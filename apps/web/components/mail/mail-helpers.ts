import type { MailAddress } from "@/lib/mail/types";

export function formatAddress(addresses: MailAddress[] | undefined): string {
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

export function formatMessageDate(
  receivedAt: string | undefined,
  timeFormat?: "12h" | "24h",
  timezone?: string,
): string {
  if (!receivedAt) return "";
  const date = new Date(receivedAt);
  const now = new Date();
  const hour12 =
    timeFormat === "12h" ? true : timeFormat === "24h" ? false : undefined;
  const timeZone = timezone ?? undefined;
  const dateStr = date.toLocaleDateString(undefined, { timeZone });
  const todayStr = now.toLocaleDateString(undefined, { timeZone });
  if (dateStr === todayStr) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12, timeZone });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone });
}
