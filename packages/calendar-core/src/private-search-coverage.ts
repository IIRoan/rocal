import { z } from "./zod";
import {
  MAIL_BODY_EXCERPT_MAX_CHARS,
  MAIL_BODY_MAX_INDEXED,
} from "./mail-body-index";
import {
  mailToTitleIndexDocument,
  type TitleIndexDocument,
  type TitleIndexMailSource,
} from "./title-search-index";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const reason = z.enum([
  "mailbox_limit",
  "mailbox_message_limit",
  "message_limit",
  "fetch_failure",
]);
const coverageSchema = z
  .strictObject({
    version: z.literal(1),
    titles: z.strictObject({
      state: z.enum(["unknown", "complete", "partial"]),
      indexedMessages: count.nullable(),
      examinedMailboxes: count.nullable(),
      knownMailboxes: count.nullable(),
      reasons: z.array(reason).max(4),
    }),
    bodies: z.strictObject({
      eligibleMessages: count.nullable(),
      indexedMessages: count.nullable(),
      pendingMessages: count.nullable(),
      maxMessages: count.min(1),
      maxChars: count.min(1),
    }),
  })
  .refine((value) => {
    const titles = value.titles;
    if (
      titles.state !== "unknown" &&
      (titles.indexedMessages === null ||
        titles.examinedMailboxes === null ||
        titles.knownMailboxes === null)
    )
      return false;
    if (
      titles.examinedMailboxes !== null &&
      titles.knownMailboxes !== null &&
      titles.examinedMailboxes > titles.knownMailboxes
    )
      return false;
    if (
      titles.state === "complete" &&
      (titles.reasons.length > 0 ||
        titles.examinedMailboxes !== titles.knownMailboxes)
    )
      return false;
    if (titles.state === "partial" && titles.reasons.length === 0) return false;
    const { eligibleMessages, indexedMessages, pendingMessages } = value.bodies;
    if (
      eligibleMessages === null ||
      indexedMessages === null ||
      pendingMessages === null
    )
      return true;
    return (
      indexedMessages + pendingMessages === eligibleMessages &&
      eligibleMessages <= value.bodies.maxMessages
    );
  });

export type PrivateSearchCoverage = z.infer<typeof coverageSchema>;
export type PrivateSearchCoverageReason = z.infer<typeof reason>;

export function unknownPrivateSearchCoverage(): PrivateSearchCoverage {
  return {
    version: 1,
    titles: {
      state: "unknown",
      indexedMessages: null,
      examinedMailboxes: null,
      knownMailboxes: null,
      reasons: [],
    },
    bodies: {
      eligibleMessages: null,
      indexedMessages: null,
      pendingMessages: null,
      maxMessages: MAIL_BODY_MAX_INDEXED,
      maxChars: MAIL_BODY_EXCERPT_MAX_CHARS,
    },
  };
}

/** Bad or newer metadata never invalidates otherwise readable local documents. */
export function parsePrivateSearchCoverage(
  value: unknown,
): PrivateSearchCoverage {
  const result = coverageSchema.safeParse(value);
  return result.success ? result.data : unknownPrivateSearchCoverage();
}

export function privateSearchCoverageText(
  value: PrivateSearchCoverage,
): string {
  if (value.titles.state === "unknown")
    return "Search coverage is unknown. Rebuild the on-device index to update it.";
  const titles =
    value.titles.state === "partial"
      ? "Searching recent indexed mail."
      : "Searching indexed mail.";
  const bodies =
    (value.bodies.pendingMessages ?? 0) > 0
      ? " Message text is still indexing."
      : "";
  return `${titles}${bodies} Text search uses excerpts from up to ${value.bodies.maxMessages} recent messages, at most ${value.bodies.maxChars} characters each.`;
}

export function withPrivateSearchBodyCoverage(
  coverage: PrivateSearchCoverage,
  documents: TitleIndexDocument[],
): PrivateSearchCoverage {
  const mail = documents.filter((document) => document.source === "mail");
  const eligibleMessages = Math.min(mail.length, MAIL_BODY_MAX_INDEXED);
  const indexedMessages = mail.filter(
    (document) => document.body !== undefined,
  ).length;
  return {
    ...coverage,
    bodies: {
      eligibleMessages,
      indexedMessages,
      pendingMessages: eligibleMessages - indexedMessages,
      maxMessages: MAIL_BODY_MAX_INDEXED,
      maxChars: MAIL_BODY_EXCERPT_MAX_CHARS,
    },
  };
}

/** Collects bounded header pages without treating folder totals as unique account totals. */
export async function collectPrivateMailTitles(input: {
  mailboxIds: string[];
  loadPage: (
    mailboxId: string,
    position: number,
    limit: number,
  ) => Promise<{ messages: TitleIndexMailSource[]; total: number }>;
  isCurrent?: () => boolean;
}): Promise<{
  documents: TitleIndexDocument[];
  coverage: PrivateSearchCoverage;
}> {
  const reasons = new Set<PrivateSearchCoverageReason>();
  const unique = new Map<string, TitleIndexDocument>();
  let examinedMailboxes = 0;
  const mailboxIds = input.mailboxIds.slice(0, 12);
  if (input.mailboxIds.length > mailboxIds.length) reasons.add("mailbox_limit");
  for (const mailboxId of mailboxIds) {
    if (unique.size >= 6000) {
      reasons.add("message_limit");
      break;
    }
    if (input.isCurrent && !input.isCurrent())
      throw new Error("Private search was cancelled.");
    examinedMailboxes += 1;
    let position = 0;
    let total = Number.POSITIVE_INFINITY;
    while (position < total && position < 800 && unique.size < 6000) {
      const page = await input
        .loadPage(mailboxId, position, Math.min(100, 800 - position))
        .catch(() => null);
      if (input.isCurrent && !input.isCurrent())
        throw new Error("Private search was cancelled.");
      if (!page) {
        reasons.add("fetch_failure");
        break;
      }
      total = page.total;
      if (page.messages.length === 0) {
        if (position < total) reasons.add("fetch_failure");
        break;
      }
      for (const message of page.messages) {
        if (unique.size >= 6000 && !unique.has(message.id)) {
          reasons.add("message_limit");
          break;
        }
        unique.set(message.id, mailToTitleIndexDocument(message));
      }
      position += page.messages.length;
      if (position < total && position >= 800)
        reasons.add("mailbox_message_limit");
      if (position < total && unique.size >= 6000) reasons.add("message_limit");
    }
  }
  const documents = [...unique.values()];
  const coverage = unknownPrivateSearchCoverage();
  coverage.titles = {
    state: reasons.size ? "partial" : "complete",
    indexedMessages: documents.length,
    examinedMailboxes,
    knownMailboxes: input.mailboxIds.length,
    reasons: [...reasons],
  };
  return { documents, coverage };
}

export type PrivateMailSearchResult<T> = {
  messages: T[];
  coverage: PrivateSearchCoverage | null;
  matchCount: number;
  limit: number;
};
