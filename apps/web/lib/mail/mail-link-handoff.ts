import {
  assessMailLink,
  shouldConfirmMailLink,
  type MailtoDraft,
} from "@workspace/calendar-core";
import { z } from "@workspace/calendar-core/zod";

export const MAIL_LINK_CHANNEL = "solace:mail-link";
export const MAIL_LINK_PATH = "/mail/link";
export const MAIL_LINK_REGISTRY_LIMIT = 2_000;

export type MailLink = { href: string; text: string };

const MAIL_LINK_ID_PATTERN = /^[0-9a-f-]{36}\.\d{1,5}$/;
const mailLinkIdSchema = z.string().regex(MAIL_LINK_ID_PATTERN);
const resolveRequestSchema = z.strictObject({ type: z.literal("resolve"), id: mailLinkIdSchema });
const resolvedResponseSchema = z.strictObject({
  type: z.literal("resolved"),
  id: mailLinkIdSchema,
  href: z.string().max(16_384),
  text: z.string().max(512),
});

const registry = new Map<string, MailLink>();
let pendingMailto: MailtoDraft | null = null;

/** Only an opaque random id ever reaches a URL; the reader tab answers for it over a same-origin channel. */
export function mailLinkHandoffUrl(id: string): string {
  return `${window.location.origin}${MAIL_LINK_PATH}#${id}`;
}

export function registerMailLinks(entries: ReadonlyArray<MailLink & { id: string }>): void {
  for (const { id, href, text } of entries) {
    registry.delete(id);
    registry.set(id, { href, text });
  }
  for (const id of registry.keys()) {
    if (registry.size <= MAIL_LINK_REGISTRY_LIMIT) break;
    registry.delete(id);
  }
}

export function clearMailLinkHandoff(): void {
  registry.clear();
  pendingMailto = null;
}

/** Answers link pages opened from this tab's messages; returns the channel's teardown. */
export function startMailLinkResponder(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(MAIL_LINK_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const request = resolveRequestSchema.safeParse(event.data);
    if (!request.success) return;
    const link = registry.get(request.data.id);
    if (link) channel.postMessage({ type: "resolved", id: request.data.id, ...link });
  };
  return () => channel.close();
}

export function resolveMailLink(id: string, timeoutMs = 5_000): Promise<MailLink | null> {
  if (!MAIL_LINK_ID_PATTERN.test(id) || typeof BroadcastChannel === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(MAIL_LINK_CHANNEL);
    const finish = (link: MailLink | null) => {
      clearTimeout(timer);
      channel.close();
      resolve(link);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const response = resolvedResponseSchema.safeParse(event.data);
      if (response.success && response.data.id === id) {
        finish({ href: response.data.href, text: response.data.text });
      }
    };
    channel.postMessage({ type: "resolve", id });
  });
}

export function setPendingMailto(draft: MailtoDraft): void {
  pendingMailto = draft;
}

export function takePendingMailto(): MailtoDraft | null {
  const draft = pendingMailto;
  pendingMailto = null;
  return draft;
}

/** The browser's WHATWG parser gives the canonical URL (IDN hosts as `xn--`); null when it cannot open the link at all. */
export function canonicalMailLinkUrl(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Replaces the link page, so the destination gets no opener and, with the page's no-referrer policy, no referrer. */
export function openMailLinkTarget(url: string): void {
  window.location.replace(url);
}

function shouldHandOffLink(link: MailLink, confirmExternalLinks: boolean): boolean {
  if (/^mailto:/i.test(link.href)) return true;
  const url = canonicalMailLinkUrl(link.href);
  return url !== null && shouldConfirmMailLink(assessMailLink(url.href, link.text), confirmExternalLinks);
}

/** Rewrites the links this reader hands off and collects them for `registerMailLinks`; a fresh array per render. */
export function createMailLinkRewriter(token: string, confirmExternalLinks: boolean) {
  const links: Array<MailLink & { id: string }> = [];
  const rewriteLink = (link: MailLink): string | null => {
    if (!shouldHandOffLink(link, confirmExternalLinks)) return null;
    const id = `${token}.${links.length}`;
    links.push({ id, ...link });
    return mailLinkHandoffUrl(id);
  };
  return { links, rewriteLink };
}
