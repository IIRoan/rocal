import { normalizeEmailAddress } from "./mail-addresses";

type HeaderAddress = { email?: string | null; name?: string | null };

/** Optional JMAP Email properties for Reply-To, Delivered-To and the SimpleLogin forward markers. */
export type MailSimpleLoginFields = {
  replyTo?: HeaderAddress[] | null;
  "header:Delivered-To:asAddresses:all"?: (HeaderAddress[] | null)[] | null;
  "header:X-Solace-SimpleLogin:asText"?: string | null;
  "header:X-SimpleLogin-Envelope-To:asAddresses"?: HeaderAddress[] | null;
  "header:X-SimpleLogin-Unsub-Behaviour:asText"?: string | null;
  "header:List-Unsubscribe:asURLs"?: string[] | null;
};

export const SIMPLELOGIN_JMAP_PROPERTIES = [
  "replyTo",
  "header:Delivered-To:asAddresses:all",
  "header:X-Solace-SimpleLogin:asText",
  "header:X-SimpleLogin-Envelope-To:asAddresses",
  "header:X-SimpleLogin-Unsub-Behaviour:asText",
  "header:List-Unsubscribe:asURLs",
] as const;

export const SIMPLELOGIN_REVERSE_ALIAS_DOMAIN = "simplelogin.co";
const SIMPLELOGIN_APP_HOST = "app.simplelogin.io";
/** IMAP/JMAP keyword marking that the alias action already ran for this message. */
export const SIMPLELOGIN_DONE_KEYWORD = "$unsubscribed";

export type SimpleLoginActionKind = "alias-disable" | "contact-block" | "unsubscribe";

export type SimpleLoginActionTarget =
  | { type: "mailto"; to: string; subject: string; body: string }
  | { type: "https"; url: string };

export type SimpleLoginAction = {
  kind: SimpleLoginActionKind;
  label: string;
  pendingLabel: string;
  doneLabel: string;
  confirmTitle: string;
  confirmMessage: string;
  target: SimpleLoginActionTarget;
};

export type SimpleLoginForward = {
  alias: string | null;
  action: SimpleLoginAction | null;
};

const ACTION_COPY: Record<
  SimpleLoginActionKind,
  Omit<SimpleLoginAction, "kind" | "target">
> = {
  "alias-disable": {
    label: "Disable alias",
    pendingLabel: "Disabling alias…",
    doneLabel: "Alias disabled",
    confirmTitle: "Disable this alias?",
    confirmMessage:
      "SimpleLogin stops forwarding all mail sent to this alias. You can turn it back on in SimpleLogin.",
  },
  "contact-block": {
    label: "Block sender",
    pendingLabel: "Blocking sender…",
    doneLabel: "Sender blocked",
    confirmTitle: "Block this sender?",
    confirmMessage:
      "SimpleLogin stops forwarding mail from this sender to your alias. You can unblock them in SimpleLogin.",
  },
  unsubscribe: {
    label: "Unsubscribe",
    pendingLabel: "Unsubscribing…",
    doneLabel: "Unsubscribed",
    confirmTitle: "Unsubscribe?",
    confirmMessage: "SimpleLogin stops forwarding these messages to you.",
  },
};

const DEFAULT_MAILTO_SUBJECT = "Unsubscribe";
const DEFAULT_MAILTO_BODY = "Please, unsubscribe me";

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1) : "";
}

export function isSimpleLoginReverseAlias(email: string | null | undefined): boolean {
  if (!email) return false;
  return emailDomain(normalizeEmailAddress(email)) === SIMPLELOGIN_REVERSE_ALIAS_DOMAIN;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** RFC 6068 mailto: `+` stays literal, so URLSearchParams (form decoding) is not used. */
function parseMailtoTarget(url: string): SimpleLoginActionTarget | null {
  if (!/^mailto:/i.test(url)) return null;
  const rest = url.slice("mailto:".length);
  const queryIndex = rest.indexOf("?");
  const rawTo = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const to = safeDecode(rawTo);
  if (!to || to.includes(",") || emailDomain(normalizeEmailAddress(to)) !== SIMPLELOGIN_REVERSE_ALIAS_DOMAIN) {
    return null;
  }

  const fields: Record<string, string> = {};
  if (queryIndex >= 0) {
    for (const pair of rest.slice(queryIndex + 1).split("&")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const key = safeDecode(pair.slice(0, eq))?.toLowerCase();
      const value = safeDecode(pair.slice(eq + 1));
      if (key && value !== null && !(key in fields)) fields[key] = value;
    }
  }

  return {
    type: "mailto",
    to: normalizeEmailAddress(to),
    subject: fields.subject?.trim() || DEFAULT_MAILTO_SUBJECT,
    body: fields.body?.trim() || DEFAULT_MAILTO_BODY,
  };
}

/** Host check by pattern: React Native's URL polyfill does not implement `hostname`. */
function parseHttpsTarget(url: string): SimpleLoginActionTarget | null {
  const match = url.match(/^https:\/\/([^/?#:@\s]+)(?::443)?(?:[/?#]|$)/i);
  if (!match || match[1]?.toLowerCase() !== SIMPLELOGIN_APP_HOST) return null;
  if (/\s/.test(url)) return null;
  return { type: "https", url };
}

function resolveActionKind(behaviour: string | null | undefined): SimpleLoginActionKind {
  const normalized = behaviour?.trim().toLowerCase();
  if (normalized === "alias-disable") return "alias-disable";
  if (normalized === "contact-block") return "contact-block";
  return "unsubscribe";
}

/** SimpleLogin forward details, only for messages Stalwart's DATA script verified and marked. */
export function getSimpleLoginForward(
  message: MailSimpleLoginFields,
): SimpleLoginForward | null {
  if (message["header:X-Solace-SimpleLogin:asText"]?.trim().toLowerCase() !== "forward") {
    return null;
  }

  const aliasEmail = message["header:X-SimpleLogin-Envelope-To:asAddresses"]?.find(
    (entry) => entry.email?.trim(),
  )?.email;
  const alias = aliasEmail ? normalizeEmailAddress(aliasEmail) : null;

  let target: SimpleLoginActionTarget | null = null;
  for (const url of message["header:List-Unsubscribe:asURLs"] ?? []) {
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    target = parseMailtoTarget(trimmed) ?? parseHttpsTarget(trimmed);
    if (target) break;
  }

  const kind = resolveActionKind(message["header:X-SimpleLogin-Unsub-Behaviour:asText"]);
  return {
    alias,
    action: target ? { kind, ...ACTION_COPY[kind], target } : null,
  };
}

/** Topmost-first Delivered-To addresses; Stalwart's own header is the first one. */
export function getDeliveredToAddresses(message: MailSimpleLoginFields): HeaderAddress[] {
  return (message["header:Delivered-To:asAddresses:all"] ?? []).flatMap(
    (instance) => instance ?? [],
  );
}

export type SimpleLoginReplyNotice = {
  /** Set when every recipient is a reverse alias. */
  replyingThrough: { sender: string; alias: string } | null;
  /** Mailbox SimpleLogin accepts replies from, set when the chosen From differs. */
  requiredFrom: string | null;
};

export function getSimpleLoginReplyNotice(input: {
  message: MailSimpleLoginFields & { from?: HeaderAddress[] | null };
  recipients: readonly string[];
  fromEmail: string | null | undefined;
  receivingEmail: string | null | undefined;
}): SimpleLoginReplyNotice {
  const none = { replyingThrough: null, requiredFrom: null };
  const forward = getSimpleLoginForward(input.message);
  if (!forward || input.recipients.length === 0) return none;

  const reverseAliasCount = input.recipients.filter(isSimpleLoginReverseAlias).length;
  if (reverseAliasCount === 0) return none;

  const sender = input.message.from?.[0];
  const senderLabel = sender?.name?.trim() || sender?.email?.trim() || "The sender";
  const replyingThrough =
    forward.alias && reverseAliasCount === input.recipients.length
      ? { sender: senderLabel, alias: forward.alias }
      : null;

  const receiving = input.receivingEmail ? normalizeEmailAddress(input.receivingEmail) : null;
  const from = input.fromEmail ? normalizeEmailAddress(input.fromEmail) : null;
  const requiredFrom = receiving && from && receiving !== from ? receiving : null;

  return { replyingThrough, requiredFrom };
}
