import {
  getTrustedAuthResultsHeader,
  parseAuthResults,
  type MailAuthResultsFields,
} from "./mail-auth-results";
import { assessMailLink, describeMailLink, getLinkHost } from "./mail-links";
import { parseMailtoLink } from "./mail-mailto";
import {
  getSimpleLoginForward,
  SIMPLELOGIN_DONE_KEYWORD,
  type MailSimpleLoginFields,
} from "./mail-simplelogin";

export const LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY = "header:List-Unsubscribe-Post:asText";

export type MailUnsubscribeFields = MailAuthResultsFields & {
  "header:List-Unsubscribe:asURLs"?: string[] | null;
  [LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY]?: string | null;
};

/** SimpleLogin's done mark (`$unsubscribed`), aliased this way round so the modules import in one direction only. */
export const MAIL_UNSUBSCRIBED_KEYWORD = SIMPLELOGIN_DONE_KEYWORD;

export type MailUnsubscribeTarget =
  | { type: "one-click"; url: string }
  | { type: "mailto"; to: string; subject: string; body: string }
  | { type: "https"; url: string };

export type MailUnsubscribe = { targets: MailUnsubscribeTarget[]; host: string | null };

const MAX_UNSUBSCRIBE_URLS = 8;
const MAX_UNSUBSCRIBE_URL_LENGTH = 2_048;
const PRIVATE_HOST_SUFFIX = /\.(?:local|localhost|internal|lan|home\.arpa)$/;

/** A DKIM-passing sender could otherwise make the phone POST to a device on the LAN. */
function publicHttpsHost(url: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (!/^https:\/\//i.test(url) || /[\s\x00-\x1f\x7f]/.test(url)) return null;
  const host = getLinkHost(url);
  if (!host || !host.includes(".") || host.startsWith("[") || PRIVATE_HOST_SUFFIX.test(host)) {
    return null;
  }
  // Resolvers read a numeric last label as an IPv4 literal (`127.1`, `0x7f.1`); no real TLD is numeric.
  return /^(?:0x[0-9a-f]*|\d+)$/i.test(host.slice(host.lastIndexOf(".") + 1)) ? null : host;
}

/** RFC 2369/8058 targets in the order to try, only for DKIM-passing mail that is not a SimpleLogin forward. */
export function getMailUnsubscribe(
  message: MailUnsubscribeFields & MailSimpleLoginFields,
  options: { allowOneClick: boolean; allowMailto: boolean },
): MailUnsubscribe | null {
  if (getSimpleLoginForward(message)) return null;
  if (parseAuthResults(getTrustedAuthResultsHeader(message)).dkim !== "pass") return null;

  const urls = (message["header:List-Unsubscribe:asURLs"] ?? [])
    .slice(0, MAX_UNSUBSCRIBE_URLS)
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length <= MAX_UNSUBSCRIBE_URL_LENGTH);
  const https = urls.find((url) => publicHttpsHost(url) !== null) ?? null;
  const targets: MailUnsubscribeTarget[] = [];

  const post = message[LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY]?.trim().toLowerCase();
  if (options.allowOneClick && https && post === "list-unsubscribe=one-click") {
    targets.push({ type: "one-click", url: https });
  }
  if (options.allowMailto) {
    for (const url of urls) {
      const draft = parseMailtoLink(url);
      const to = draft?.to[0];
      if (!draft || !to || draft.to.length + draft.cc.length + draft.bcc.length !== 1) continue;
      targets.push({
        type: "mailto",
        to,
        subject: draft.subject || "Unsubscribe",
        body: draft.body.trim() || "Please unsubscribe me.",
      });
      break;
    }
  }
  if (https) targets.push({ type: "https", url: https });

  return targets.length > 0 ? { targets, host: https ? publicHttpsHost(https) : null } : null;
}

export const MAIL_UNSUBSCRIBE_LABELS = {
  title: "Unsubscribe?",
  action: "Unsubscribe",
  pending: "Unsubscribing…",
  done: "Unsubscribed",
} as const;

/** Confirm copy for the first target; a look-alike host carries the same warning as a link in mail. */
export function describeMailUnsubscribe(target: MailUnsubscribeTarget, address: string): string {
  if (target.type === "mailto") {
    return `Solace sends an unsubscribe email from ${address} to ${target.to}.`;
  }
  const assessment = assessMailLink(target.url, "");
  const host = getLinkHost(target.url) ?? "";
  const message =
    target.type === "one-click"
      ? `Solace asks ${host} to remove ${address} from this list. The sender sees your IP address.`
      : `Opens the sender's unsubscribe page at ${host}.`;
  return [message, ...describeMailLink(assessment).lines.slice(1)].join(" ");
}
