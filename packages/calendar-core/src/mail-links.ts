/** Regex only: Hermes has no WHATWG URL, so callers pass canonical URLs (browser `href`, WebView navigation URL). */
const LINK_HOST_PATTERN = /^https?:\/\/(?:[^@/?#\\]*@)?(\[[^\]]*\]|[^:/?#\\]*)/i;

export function getLinkHost(url: string): string | null {
  const host = LINK_HOST_PATTERN.exec(url)?.[1]?.toLowerCase().replace(/\.$/, "");
  return host || null;
}

/** Our own list of unambiguous click-tracking keys; generic names such as `ref` or `source` stay. */
export const TRACKING_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "twclid", "ttclid",
  "li_fat_id", "mc_cid", "mc_eid", "igshid", "yclid", "_hsenc", "_hsmi", "__hstc", "__hssc",
  "__hsfp", "mkt_tok", "oly_anon_id", "oly_enc_id", "vero_id", "vero_conv", "ml_subscriber",
  "ml_subscriber_hash", "rb_clickid", "s_cid", "wickedid", "_openstat",
]);

function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isTrackingPair(pair: string): boolean {
  const key = decodeKey(pair.split("=", 1)[0] ?? "").toLowerCase();
  return key.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(key);
}

/** Drops tracking pairs from an http(s) query; every other pair stays byte-for-byte and in order. */
export function stripTrackingParams(href: string): string {
  if (!/^https?:/i.test(href)) return href;
  const hashIndex = href.indexOf("#");
  const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  if (queryIndex === -1) return href;
  const pairs = beforeHash.slice(queryIndex + 1).split("&");
  const kept = pairs.filter((pair) => !isTrackingPair(pair));
  if (kept.length === pairs.length) return href;
  const query = kept.join("&");
  return (
    beforeHash.slice(0, queryIndex) +
    (query ? `?${query}` : "") +
    (hashIndex === -1 ? "" : href.slice(hashIndex))
  );
}

export type MailLinkWarning = "international-host" | "text-mismatch";

export type MailLinkAssessment = {
  host: string;
  textHost: string | null;
  warnings: MailLinkWarning[];
};

const TEXT_HOST_PATTERN =
  /^<?(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,63})(?::\d+)?(?:[/?#]\S*)?>?$/i;

function withoutWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Without the public suffix list on purpose: a redirector on another domain is flagged too, which is true. */
function isSameSite(first: string, second: string): boolean {
  const a = withoutWww(first);
  const b = withoutWww(second);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Every IDN host warns: telling look-alikes from real scripts needs Unicode data Hermes lacks. */
export function assessMailLink(canonicalUrl: string, text: string): MailLinkAssessment {
  const host = getLinkHost(canonicalUrl) ?? "";
  const textHost = TEXT_HOST_PATTERN.exec(text.trim())?.[1]?.toLowerCase() ?? null;
  const warnings: MailLinkWarning[] = [];
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(host) || /(?:^|\.)xn--/.test(host)) warnings.push("international-host");
  if (textHost && !isSameSite(host, textHost)) warnings.push("text-mismatch");
  return { host, textHost, warnings };
}

export function describeMailLink(assessment: MailLinkAssessment): { title: string; lines: string[] } {
  const lines = [`Opens ${assessment.host}.`];
  if (assessment.warnings.includes("international-host")) {
    lines.push(
      "This address uses international or look-alike characters. Check that it's the site you expect.",
    );
  }
  if (assessment.warnings.includes("text-mismatch")) {
    lines.push(`The link text shows ${assessment.textHost}, but it opens ${assessment.host}.`);
  }
  return { title: "Open this link?", lines };
}

/** Confirmation is the user's choice, except that a warned link always asks. */
export function shouldConfirmMailLink(
  assessment: MailLinkAssessment,
  confirmExternalLinks: boolean,
): boolean {
  return confirmExternalLinks || assessment.warnings.length > 0;
}
