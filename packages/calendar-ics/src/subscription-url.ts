const ICS_FEED_FILE_EXTENSIONS = [".ics", ".ical"] as const;
const ICS_FEED_SCRIPT_EXTENSIONS = [".php", ".asp", ".aspx", ".cgi"] as const;
const ICS_FEED_DIRECTORY_SUFFIX = /(?:^|\/)(?:ical|feed)\/?$/i;

export const SUBSCRIPTION_FEED_URL_HELP_TEXT =
  "Paste a link to a calendar feed. Supports .ics and .ical files, webcal:// links, and authenticated endpoints such as ical.php?token=....";

function toHttpSubscriptionUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }

  return trimmed;
}

export function isLikelyIcsFeedUrl(rawUrl: string): boolean {
  try {
    const value = toHttpSubscriptionUrl(rawUrl);
    if (!value) {
      return false;
    }

    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const pathname = normalizePathname(parsed.pathname);

    if (ICS_FEED_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return true;
    }

    if (
      ICS_FEED_SCRIPT_EXTENSIONS.some((extension) => pathname.endsWith(extension)) &&
      /ical|calendar|feed/i.test(pathname)
    ) {
      return true;
    }

    return ICS_FEED_DIRECTORY_SUFFIX.test(pathname);
  } catch {
    return false;
  }
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.toLowerCase();
  if (normalized.length > 1) {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
}

export function normalizeSubscriptionFeedUrl(value: string): string {
  try {
    const parsed = new URL(toHttpSubscriptionUrl(value));
    parsed.hash = "";
    parsed.pathname = normalizePathname(parsed.pathname) || "/";

    return parsed.toString();
  } catch {
    return value.trim();
  }
}
