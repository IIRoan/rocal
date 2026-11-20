import { getLinkHost } from "./mail-links";

/** Our own list of open-tracking endpoints, not derived from EasyPrivacy or Disconnect; a path ending in `/` matches as a prefix. */
export const KNOWN_MAIL_TRACKERS: ReadonlyArray<{ host: string; path?: string }> = [
  { host: "list-manage.com", path: "/track/open.php" },
  { host: "mandrillapp.com", path: "/track/open.php" },
  { host: "sendgrid.net", path: "/wf/open" },
  { host: "awstrack.me", path: "/I0/" },
  { host: "customeriomail.com", path: "/e/o/" },
  { host: "customer.io", path: "/e/o/" },
  { host: "mailtrack.io", path: "/trace/mail/" },
  { host: "emltrk.com" },
  { host: "r.superhuman.com" },
  { host: "t.yesware.com" },
  { host: "mailfoogae.appspot.com" },
  { host: "getnotify.com" },
  { host: "email81.com" },
  { host: "google-analytics.com", path: "/collect" },
  { host: "doubleclick.net" },
  { host: "facebook.com", path: "/tr" },
];

export type EmailTrackerSummary = { count: number; hosts: string[] };

/** Browsers ignore whitespace and control characters in URLs, read `\` as `/` and load `//host` over https. */
export function normalizeMailImageUrl(value: string): string {
  const normalized = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x20\x7f-\x9f]+/g, "")
    .replace(/\\/g, "/");
  return normalized.startsWith("//") ? `https:${normalized}` : normalized;
}

/** The image host when `src` is a known open-tracking endpoint, else null. */
export function matchKnownTracker(src: string): string | null {
  const url = normalizeMailImageUrl(src);
  const host = getLinkHost(url);
  if (!host) return null;
  const path = /^https?:\/\/[^/?#]*([^?#]*)/i.exec(url)?.[1] || "/";
  const known = KNOWN_MAIL_TRACKERS.some(
    (rule) =>
      (host === rule.host || host.endsWith(`.${rule.host}`)) &&
      (!rule.path || (rule.path.endsWith("/") ? path.startsWith(rule.path) : path === rule.path)),
  );
  return known ? host : null;
}

export function getMailTrackerNotice(summary: EmailTrackerSummary): { label: string; detail: string } {
  return {
    label: `Blocked ${summary.count} tracker${summary.count === 1 ? "" : "s"}`,
    detail: "Senders use these to learn when and where you open their mail. They never load, even after you load images.",
  };
}
