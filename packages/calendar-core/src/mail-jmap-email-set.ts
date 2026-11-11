import { z } from "./zod";
import { buildPgpMimeMessage, createMailMessageId } from "./mail-pgp-mime";
import {
  getEmailDomain,
  parseRecipientString,
  type ParsedMailAddress,
} from "./mail-addresses";
import {
  assertSuccessfulJmapResponses,
  findJmapResponseError,
} from "./mail-jmap-validation";
import {
  validateOutgoingJmapMessage,
  validateOutgoingMessageSize,
  validateJmapRequestSize,
  resolveMailboxSearchPageSize,
  type JmapMethodCallLike,
  type MailServerPolicy,
} from "./mail-server-policy";

export type JmapEmailSetMethodCall = [
  "Email/set",
  Record<string, unknown>,
  string,
];

export type JmapAttachmentInput = {
  blobId: string;
  name: string;
  type: string;
  size: number;
  disposition?: "attachment" | "inline";
  cid?: string;
};

export type JmapPgpMimeCiphertext = {
  blobId: string;
  size: number;
};

/** Creation id of the self-encrypted Sent copy created next to a plaintext submission. */
export const SENT_COPY_CREATION_ID = "sent1";

type OutgoingEmailHeaders = {
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
};

function toJmapAddressList(addresses: string[]): ParsedMailAddress[] {
  return addresses.map((address) => parseRecipientString(address));
}

function buildEmailHeaders(
  input: OutgoingEmailHeaders,
): Record<string, unknown> {
  const fromName = input.fromName?.trim();
  return {
    from: [{ email: input.fromEmail, ...(fromName ? { name: fromName } : {}) }],
    to: toJmapAddressList(input.to),
    ...(input.cc?.length ? { cc: toJmapAddressList(input.cc) } : {}),
    ...(input.bcc?.length ? { bcc: toJmapAddressList(input.bcc) } : {}),
    subject: input.subject,
  };
}

function normalizeJmapBodyValue(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\r\n");
}

/** RFC 3156 PGP/MIME body: a version part and the armored ciphertext blob, the layout Stalwart's encryption at rest uses. */
function buildPgpMimeContentFields(
  ciphertext: JmapPgpMimeCiphertext,
): Record<string, unknown> {
  return {
    bodyStructure: {
      type: "multipart/encrypted",
      subParts: [
        { type: "application/pgp-encrypted", partId: "pgp-version" },
        {
          type: "application/octet-stream",
          blobId: ciphertext.blobId,
          size: ciphertext.size,
        },
      ],
    },
    bodyValues: { "pgp-version": { value: "Version: 1\r\n" } },
  };
}

/** JMAP Email/set body fields, using the convenience textBody/htmlBody/attachments properties for plaintext. */
function buildEmailContentFields(input: {
  textBody: string;
  htmlBody?: string;
  attachments?: JmapAttachmentInput[];
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
}): Record<string, unknown> {
  if (input.pgpMimeCiphertext) {
    return buildPgpMimeContentFields(input.pgpMimeCiphertext);
  }

  const trimmedHtml = input.htmlBody?.trim();
  return {
    bodyValues: {
      text: { value: normalizeJmapBodyValue(input.textBody) },
      ...(trimmedHtml
        ? { html: { value: normalizeJmapBodyValue(trimmedHtml) } }
        : {}),
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    ...(trimmedHtml
      ? { htmlBody: [{ partId: "html", type: "text/html" }] }
      : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((attachment) => ({
            blobId: attachment.blobId,
            type: attachment.type,
            name: attachment.name,
            disposition: attachment.disposition ?? "attachment",
            ...(attachment.cid ? { cid: attachment.cid } : {}),
          })),
        }
      : {}),
  };
}

/** Shared by the submitted email and its Sent copy, so replies thread onto the copy. */
function createMessageId(fromEmail: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${token}@${getEmailDomain(fromEmail) ?? "localhost"}`;
}

export type OutgoingJmapMessage = OutgoingEmailHeaders & {
  draftsMailboxId: string;
  sentMailboxId?: string | null;
  textBody: string;
  htmlBody?: string;
  identityId: string;
  attachments?: JmapAttachmentInput[];
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
  pgpMimeMessage?: string;
  contentFingerprint?: string;
  messageId?: string;
  submissionToken?: string;
  isCurrent?: () => boolean;
  isUiCurrent?: () => boolean;
  getCurrentDraftId?: () => string | null;
  /** Self-encrypted copy stored in Sent when the submission itself is plaintext; null when it is already encrypted to the sender. */
  sentCopyCiphertext: JmapPgpMimeCiphertext | null;
  inReplyTo?: string[];
  references?: string[];
  /** Draft this message replaces; destroyed only once the submission is queued. */
  previousDraftId?: string;
};

export type JmapDraft = OutgoingEmailHeaders & {
  draftsMailboxId: string;
  ciphertext: JmapPgpMimeCiphertext;
  previousDraftId?: string;
};

/** One JMAP request through a mail client's transport. */
export type JmapRequest = (
  using: string[],
  methodCalls: JmapMethodCallLike[],
) => Promise<{ methodResponses?: JmapMethodCallLike[] }>;

export type SentJmapMessage = {
  emailId: string;
  threadId: string | null;
  submissionId: string;
};

const MAIL_CAPABILITIES = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
];

export function buildSendMessageMethodCalls(
  input: OutgoingJmapMessage,
  imported?: JmapPgpMimeCiphertext,
): JmapMethodCallLike[] {
  assertEncryptedMessageParts(input);
  if (input.pgpMimeMessage && !imported) {
    throw new Error("Encrypted attachment mail must use the import transport.");
  }
  if (input.submissionToken && !/^[a-f0-9]{32}$/.test(input.submissionToken)) throw new Error("Invalid submission reference.");
  const headers = buildEmailHeaders(input);
  const seenEnvelopeRecipients = new Set<string>();
  const envelopeRecipients: { email: string }[] = [];
  for (const address of toJmapAddressList([
    ...input.to,
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ])) {
    if (seenEnvelopeRecipients.has(address.email)) continue;
    seenEnvelopeRecipients.add(address.email);
    envelopeRecipients.push({ email: address.email });
  }

  const threading = {
    ...(input.messageId || input.sentCopyCiphertext
      ? { messageId: [input.messageId ?? createMessageId(input.fromEmail)] }
      : {}),
    ...(input.inReplyTo?.length ? { inReplyTo: input.inReplyTo } : {}),
    ...(input.references?.length ? { references: input.references } : {}),
  };
  const create: Record<string, unknown> = {
    draft1: {
      mailboxIds: { [input.draftsMailboxId]: true },
      keywords: { $seen: true, $draft: true },
      ...threading,
      ...headers,
      ...buildEmailContentFields(input),
    },
  };

  const submissionParams: Record<string, unknown> = {
    create: {
      s1: {
        emailId: "#draft1",
        identityId: input.identityId,
        envelope: {
          mailFrom: { email: input.fromEmail.trim(), ...(input.submissionToken ? { parameters: { ENVID: input.submissionToken } } : {}) },
          rcptTo: envelopeRecipients,
        },
      },
    },
  };

  if (input.sentCopyCiphertext) {
    // Stalwart queues its own copy of the bytes, so destroying the plaintext email never cancels delivery.
    submissionParams.onSuccessDestroyEmail = ["#s1"];
    if (input.sentMailboxId) {
      create[SENT_COPY_CREATION_ID] = {
        mailboxIds: { [input.sentMailboxId]: true },
        keywords: { $seen: true },
        ...threading,
        ...headers,
        ...buildPgpMimeContentFields(input.sentCopyCiphertext),
      };
    }
  } else if (input.sentMailboxId) {
    submissionParams.onSuccessUpdateEmail = {
      "#s1": {
        [`mailboxIds/${input.sentMailboxId}`]: true,
        [`mailboxIds/${input.draftsMailboxId}`]: null,
        "keywords/$draft": null,
      },
    };
  }

  return [
    imported
      ? [
          "Email/import",
          {
            emails: {
              draft1: {
                blobId: imported.blobId,
                mailboxIds: { [input.draftsMailboxId]: true },
                keywords: { $seen: true, $draft: true },
              },
            },
          },
          "c1",
        ]
      : ["Email/set", { create }, "c1"],
    ["EmailSubmission/set", submissionParams, "c2"],
  ];
}

/** Drafts are stored only as PGP/MIME encrypted to the account's own key; the headers stay readable. */
export function buildDraftMethodCalls(input: JmapDraft): JmapMethodCallLike[] {
  const emailSetArgs: Record<string, unknown> = {
    create: {
      draft1: {
        mailboxIds: { [input.draftsMailboxId]: true },
        keywords: { $draft: true },
        ...buildEmailHeaders(input),
        ...buildPgpMimeContentFields(input.ciphertext),
      },
    },
  };

  if (input.previousDraftId) {
    emailSetArgs.destroy = [input.previousDraftId];
  }

  return [["Email/set", emailSetArgs, "c1"]];
}

const createdEmailSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().nullish(),
});
const sendEmailSetResultSchema = z.object({
  created: z
    .object({
      draft1: createdEmailSchema.optional(),
      [SENT_COPY_CREATION_ID]: createdEmailSchema.optional(),
    })
    .nullish(),
});
const sendSubmissionResultSchema = z.object({
  created: z.object({ s1: z.object({ id: z.string().min(1) }) }),
});
const importResultSchema = z.object({
  created: sendEmailSetResultSchema.shape.created,
});
const draftSetResultSchema = z.object({
  created: z.object({ draft1: createdEmailSchema }),
});

function resultOf(
  envelope: { methodResponses?: JmapMethodCallLike[] },
  name: string,
): unknown {
  return envelope.methodResponses?.find(([method]) => method === name)?.[1];
}

function assertEncryptedMessageParts(message: OutgoingJmapMessage): void {
  const encrypted =
    Boolean(message.pgpMimeMessage || message.pgpMimeCiphertext) ||
    message.textBody.trimStart().startsWith("-----BEGIN PGP MESSAGE-----");
  if (encrypted && (message.htmlBody?.trim() || message.attachments?.length)) {
    throw new Error(
      "Encrypted mail cannot include plaintext body parts or attachments.",
    );
  }
  if (
    (message.pgpMimeMessage || message.pgpMimeCiphertext) &&
    message.textBody.length > 0
  ) {
    throw new Error(
      "Encrypted mail cannot silently discard a plaintext text body.",
    );
  }
  if (
    message.pgpMimeMessage &&
    (message.pgpMimeCiphertext || message.sentCopyCiphertext)
  ) {
    throw new Error("Encrypted mail has conflicting storage formats.");
  }
}

export type ScopedOutgoingJmapMessage = OutgoingJmapMessage & {
  sendScope: string;
};

export type MailSendAttempt = {
  messageId: string;
  fingerprint: string | null;
  accountId: string | null;
  mayHaveSubmitted: boolean;
  acknowledged: SentJmapMessage | null;
  inFlight: Promise<SentJmapMessage> | null;
  submissionToken: string;
  requestedAt: number | null;
  cancelled: boolean;
  retired: boolean;
  authorizedCommands: number;
};

export function createMailSendAttempt(fromEmail: string): MailSendAttempt {
  return {
    messageId: createMailMessageId(fromEmail),
    fingerprint: null,
    accountId: null,
    mayHaveSubmitted: false,
    acknowledged: null,
    inFlight: null,
    submissionToken: createMailSendSessionId(),
    requestedAt: null,
    cancelled: false,
    retired: false,
    authorizedCommands: 0,
  };
}

/** Retry correlation stays in account-scoped process memory across client refreshes. */
export class MailSendAttemptStore {
  private readonly records = new Map<string, MailSendAttempt>();
  private readonly completed = new Set<string>();

  get(scope: string, fromEmail: string): MailSendAttempt {
    if (
      typeof scope !== "string" ||
      !scope ||
      scope.length > 300 ||
      /[\x00-\x1f\x7f]/.test(scope)
    ) {
      throw new Error("A compose session is required before sending.");
    }
    if (!isMailSendScopeOpen(scope) || this.completed.has(scope))
      throw new Error("This compose session has finished. Open a new message before sending.");
    const previous = this.records.get(scope);
    if (previous) return previous;
    const attempt = createMailSendAttempt(fromEmail);
    this.records.set(scope, attempt);
    return attempt;
  }

  discard(scope: string): void {
    const attempt = this.records.get(scope);
    if (attempt) attempt.retired = true;
    if (!attempt?.inFlight && !attempt?.authorizedCommands && (!attempt?.mayHaveSubmitted || attempt.acknowledged)) this.records.delete(scope);
    this.completed.add(scope);
  }

  cancelAll(): void {
    for (const attempt of this.records.values()) attempt.cancelled = true;
    this.records.clear();
  }

  complete(scope: string): void {
    if (!this.records.get(scope)?.acknowledged) return;
    this.records.delete(scope);
    this.completed.add(scope);
  }
}

const discardedSendScopes = new Set<string>();
const retiringSendScopes = new Map<string, object>();
type MailSendScopeRegistration = { readScope: () => string | null; readDraftId?: () => string | null };
let currentDraftRegistration: MailSendScopeRegistration | null = null;
let mailSendOwner: string | null = null;
const accountSendAttempts = new Map<string, MailSendAttemptStore>();
const actionSendAttempts = new Map<string, Map<string, { scope: string; inFlight: Promise<void> | null; cancelled: boolean }>>();

export function createMailSendSessionId(): string {
  return createMailMessageId("session@local.invalid").split("@")[0] ?? "";
}

export function getMailSendAttemptStore(accountId: string): MailSendAttemptStore {
  if (!accountId || accountId.length > 1024 || /[\x00-\x1f\x7f]/.test(accountId))
    throw new Error("A mailbox account is required before sending.");
  const previous = accountSendAttempts.get(accountId);
  if (previous) return previous;
  const store = new MailSendAttemptStore();
  accountSendAttempts.set(accountId, store);
  return store;
}

export function completeMailSendAttempt(accountId: string | null, scope: string): void {
  if (accountId) accountSendAttempts.get(accountId)?.complete(scope);
}

export function createMailSendScopeLifetime() {
  let active: MailSendScopeRegistration | null = null;
  return {
    activate(readScope: () => string | null, readDraftId?: () => string | null): () => void {
      const lifetime = { readScope, readDraftId };
      if (readDraftId) currentDraftRegistration = lifetime;
      active = lifetime;
      const resumed = readScope();
      if (resumed) retiringSendScopes.delete(resumed);
      return () => {
        if (currentDraftRegistration === lifetime) currentDraftRegistration = null;
        const scope = readScope();
        if (!scope) return;
        const retirement = {};
        retiringSendScopes.set(scope, retirement);
        queueMicrotask(() => {
          if (active === lifetime || active?.readScope() !== scope) discardMailSendAttempt(scope);
          if (retiringSendScopes.get(scope) === retirement) retiringSendScopes.delete(scope);
        });
      };
    },
  };
}

export function getCurrentMailComposeDraftId(): string | null {
  const current = currentDraftRegistration;
  const scope = current?.readScope();
  return scope && isMailSendScopeOpen(scope) ? current?.readDraftId?.() ?? null : null;
}

export function isMailSendScopeOpen(scope: string): boolean {
  return !discardedSendScopes.has(scope) && !retiringSendScopes.has(scope);
}

export function discardMailSendAttempt(scope: string): void {
  discardedSendScopes.add(scope);
  for (const store of accountSendAttempts.values()) store.discard(scope);
}

export function bindMailSendOwner(ownerUserId: string | null): void {
  if (mailSendOwner === ownerUserId) return;
  clearMailSendAttempts();
  mailSendOwner = ownerUserId;
}

export function clearMailSendAttempts(): void {
  for (const store of accountSendAttempts.values()) store.cancelAll();
  for (const actions of actionSendAttempts.values()) for (const action of actions.values()) action.cancelled = true;
  accountSendAttempts.clear();
  actionSendAttempts.clear();
  discardedSendScopes.clear();
  retiringSendScopes.clear();
  mailSendOwner = null;
  currentDraftRegistration = null;
}

/** A failed command retains its random scope until acceptance is known or the account signs out. */
export async function runMailSendAction(
  accountId: string,
  actionId: string,
  send: (scope: string, isCurrent: () => boolean) => Promise<unknown>,
): Promise<void> {
  let actions = actionSendAttempts.get(accountId);
  if (!actions) {
    actions = new Map();
    actionSendAttempts.set(accountId, actions);
  }
  let attempt = actions.get(actionId);
  if (!attempt) {
    attempt = { scope: `action:${createMailSendSessionId()}`, inFlight: null, cancelled: false };
    actions.set(actionId, attempt);
  }
  if (attempt.inFlight) return attempt.inFlight;
  const current = attempt;
  const sending = Promise.resolve().then(() => {
    if (current.cancelled) throw new Error("This mail action was closed before sending.");
    return send(current.scope, () => !current.cancelled);
  }).then(() => {
    completeMailSendAttempt(accountId, current.scope);
    if (actions.get(actionId) === current) actions.delete(actionId);
  });
  current.inFlight = sending;
  return sending.finally(() => { current.inFlight = null; });
}

export function discardMailSendAction(accountId: string, actionId: string): void {
  const actions = actionSendAttempts.get(accountId);
  const action = actions?.get(actionId);
  if (!action) return;
  action.cancelled = true;
  discardMailSendAttempt(action.scope);
  actions?.delete(actionId);
}

/** Closing an editor retires new commands; an authorized command stays fenced by its vault and owner. */
export async function withMailSendCommand<T>(attempt: MailSendAttempt, run: () => Promise<T>): Promise<T> {
  if (attempt.retired || attempt.cancelled) throw new Error("This compose session has closed.");
  attempt.authorizedCommands += 1;
  return run().finally(() => { attempt.authorizedCommands -= 1; });
}

export class JmapHttpStatusError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "JmapHttpStatusError";
  }
}

type SendContext = {
  mailAccountId: string;
  submissionAccountId: string;
  policy: MailServerPolicy | null;
  request: JmapRequest;
  attempt: MailSendAttempt;
  uploadMessage?: (wireMessage: string) => Promise<JmapPgpMimeCiphertext>;
  onCleanupError: (error: unknown) => void;
};

const UNKNOWN_SUBMISSION =
  "Could not confirm whether this message was sent. A copy in Sent does not confirm queue acceptance or delivery. Your edits and draft are kept; try confirming again before resending.";
const EARLIER_VERSION =
  "An earlier version of this message was already sent. Your current edits and draft are kept.";

export function assertMailSendCurrent(message: Pick<OutgoingJmapMessage, "isCurrent">): void {
  if (message.isCurrent && !message.isCurrent())
    throw new Error(
      "Your unlocked mailbox changed. Open the message again before sending.",
    );
}

async function sendFingerprint(message: OutgoingJmapMessage): Promise<string> {
  const recipients = (values: string[] | undefined) =>
    (values ?? [])
      .map((value) => {
        const parsed = parseRecipientString(value);
        return {
          email: parsed.email.trim().toLowerCase(),
          name: parsed.name?.trim() ?? null,
        };
      })
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  if (
    (message.pgpMimeMessage || message.contentFingerprint !== undefined) &&
    !/^[a-f0-9]{64}$/.test(message.contentFingerprint ?? "")
  ) {
    throw new Error(
      "Encrypted attachment mail is missing its content fingerprint.",
    );
  }
  const content =
    message.contentFingerprint ??
    JSON.stringify({
      text: message.textBody,
      html: message.htmlBody ?? null,
      attachments: message.attachments ?? [],
      ciphertext: message.pgpMimeCiphertext ?? null,
    });
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      from: message.fromEmail.trim().toLowerCase(),
      fromName: message.fromName?.trim() ?? null,
      to: recipients(message.to),
      cc: recipients(message.cc),
      bcc: recipients(message.bcc),
      subject: message.subject,
      identityId: message.identityId,
      inReplyTo: message.inReplyTo ?? [],
      references: message.references ?? [],
      content,
    }),
  );
  assertMailSendCurrent(message);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertMailSendCurrent(message);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const receiptQuery = z.object({
  ids: z.array(z.string().min(1)).max(100),
  total: z.number().int().nonnegative(),
  position: z.number().int().nonnegative(),
});
const receiptEmails = z.object({
  list: z.array(z.object({ id: z.string().min(1), threadId: z.string().nullish(), messageId: z.array(z.string()) })).max(100),
});
const receiptSubmissions = z.object({
  list: z.array(z.object({
    id: z.string().min(1), emailId: z.string().min(1), threadId: z.string().nullish(), undoStatus: z.string(),
    envelope: z.object({ mailFrom: z.object({ parameters: z.record(z.string(), z.unknown()).nullish() }) }).optional(),
  })).max(100),
});

function attemptTimeWindow(attempt: MailSendAttempt): { after: string; before: string } {
  const requestedAt = attempt.requestedAt;
  if (requestedAt === null) throw new Error(UNKNOWN_SUBMISSION);
  const clockSkew = 48 * 60 * 60_000;
  return { after: new Date(requestedAt - clockSkew).toISOString(), before: new Date(requestedAt + clockSkew).toISOString() };
}

async function findAttemptEmails(message: OutgoingJmapMessage, context: SendContext): Promise<z.infer<typeof receiptEmails>["list"]> {
  const pageSize = context.policy ? resolveMailboxSearchPageSize(context.policy, 100) : 100;
  const request = async (calls: JmapMethodCallLike[]) => {
    assertMailSendCurrent(message);
    assertRequestBudget(MAIL_CAPABILITIES, calls, context.policy);
    const response = await context.request(MAIL_CAPABILITIES, calls);
    assertMailSendCurrent(message);
    assertSuccessfulJmapResponses(response, "Find sent copy");
    return response;
  };
  const readHeaders = async (ids: string[]) => {
    if (!ids.length) return [];
    const read = await request([["Email/get", { accountId: context.mailAccountId, ids, properties: ["id", "threadId", "messageId"] }, "confirmHeaders"]]);
    return receiptEmails.parse(resultOf(read, "Email/get")).list.filter((email) => email.messageId.some((id) => id.replace(/^<|>$/g, "") === context.attempt.messageId));
  };
  const window = attemptTimeWindow(context.attempt);
  const indexed = await request([["Email/query", { accountId: context.mailAccountId, filter: { ...window, header: ["Message-ID", context.attempt.messageId] }, limit: pageSize, calculateTotal: true }, "confirmEmails"]]);
  const indexedPage = receiptQuery.parse(resultOf(indexed, "Email/query"));
  if (indexedPage.ids.length > pageSize) return [];
  const indexedEmails = await readHeaders(indexedPage.ids);
  if (indexedEmails.length) return indexedEmails;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const position = pageIndex * pageSize;
    const response = await request([["Email/query", { accountId: context.mailAccountId, filter: window, position, limit: pageSize, calculateTotal: true, sort: [{ property: "receivedAt", isAscending: false }] }, "confirmRecentEmails"]]);
    const page = receiptQuery.parse(resultOf(response, "Email/query"));
    if (page.position !== position || page.ids.length > pageSize) return [];
    const matches = await readHeaders(page.ids);
    if (matches.length) return matches;
    if (!page.ids.length || position + page.ids.length >= page.total) break;
  }
  return [];
}

async function reconcileSubmission(message: OutgoingJmapMessage, context: SendContext): Promise<SentJmapMessage | null> {
  const using = [...MAIL_CAPABILITIES, "urn:ietf:params:jmap:submission"];
  const pageSize = context.policy ? resolveMailboxSearchPageSize(context.policy, 100) : 100;
  const request = async (calls: JmapMethodCallLike[]) => {
    assertMailSendCurrent(message);
    assertRequestBudget(using, calls, context.policy);
    const result = await context.request(using, calls);
    assertMailSendCurrent(message);
    assertSuccessfulJmapResponses(result, "Confirm earlier submission");
    return result;
  };
  const window = attemptTimeWindow(context.attempt);
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const position = pageIndex * pageSize;
    const queried = await request([["EmailSubmission/query", { accountId: context.submissionAccountId, filter: window, position, limit: pageSize, calculateTotal: true }, "confirmSubmissions"]]);
    const page = receiptQuery.parse(resultOf(queried, "EmailSubmission/query"));
    if (page.position !== position || page.ids.length > pageSize) return null;
    if (page.ids.length) {
      const read = await request([["EmailSubmission/get", { accountId: context.submissionAccountId, ids: page.ids, properties: ["id", "emailId", "threadId", "undoStatus", "envelope"] }, "confirmReceipt"]]);
      const receipt = receiptSubmissions.parse(resultOf(read, "EmailSubmission/get")).list.find((item) => (item.undoStatus === "pending" || item.undoStatus === "final") && item.envelope?.mailFrom.parameters?.ENVID === context.attempt.submissionToken);
      if (receipt) {
        const emails = await findAttemptEmails(message, context).catch(() => []);
        const stored = message.sentCopyCiphertext ? emails.find((email) => email.id !== receipt.emailId) : emails.find((email) => email.id === receipt.emailId);
        return { emailId: stored?.id ?? receipt.emailId, threadId: stored?.threadId ?? receipt.threadId ?? null, submissionId: receipt.id };
      }
    }
    if (!page.ids.length || position + page.ids.length >= page.total) break;
  }
  return null;
}

function requestCalls(
  message: OutgoingJmapMessage,
  context: SendContext,
  imported?: JmapPgpMimeCiphertext,
): JmapMethodCallLike[] {
  return buildSendMessageMethodCalls(
    { ...message, messageId: context.attempt.messageId, submissionToken: context.attempt.submissionToken },
    imported,
  ).map(([method, params, id]) => [
    method,
    {
      ...params,
      accountId:
        method === "EmailSubmission/set"
          ? context.submissionAccountId
          : context.mailAccountId,
    },
    id,
  ]);
}

function assertRequestBudget(
  using: string[],
  calls: JmapMethodCallLike[],
  policy: MailServerPolicy | null,
): void {
  if (!policy) return;
  const error = validateJmapRequestSize(
    new TextEncoder().encode(JSON.stringify({ using, methodCalls: calls }))
      .byteLength,
    policy,
  );
  if (error) throw new Error(error);
}

async function cleanupEmails(
  message: OutgoingJmapMessage,
  context: SendContext,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  assertMailSendCurrent(message);
  const result = await context.request(MAIL_CAPABILITIES, [
    buildEmailDestroyMethodCall(context.mailAccountId, ids),
  ]);
  assertMailSendCurrent(message);
  assertSuccessfulJmapResponses(result, "Remove draft");
}

async function finishAcceptedSend(message: OutgoingJmapMessage, context: SendContext): Promise<void> {
  const draftId = message.previousDraftId;
  if (!draftId) return;
  if (!(message.isUiCurrent?.() ?? true) && message.getCurrentDraftId?.() === draftId) return;
  await cleanupEmails(message, context, [draftId]);
}

async function performSend(
  message: OutgoingJmapMessage,
  context: SendContext,
  fingerprint: string,
): Promise<SentJmapMessage> {
  const attempt = context.attempt;
  if (attempt.accountId && attempt.accountId !== context.mailAccountId)
    throw new Error("This compose attempt belongs to another mailbox.");
  if (attempt.mayHaveSubmitted) {
    const receipt = attempt.acknowledged ?? await reconcileSubmission(message, context).catch(() => null);
    assertMailSendCurrent(message);
    if (!receipt) throw new Error(UNKNOWN_SUBMISSION);
    attempt.acknowledged = receipt;
    if (attempt.fingerprint !== fingerprint) throw new Error(EARLIER_VERSION);
    await finishAcceptedSend(message, context).catch(context.onCleanupError);
    return receipt;
  }
  attempt.accountId = context.mailAccountId;
  attempt.fingerprint = fingerprint;
  const using = [...MAIL_CAPABILITIES, "urn:ietf:params:jmap:submission"];
  let imported: JmapPgpMimeCiphertext | undefined;
  if (message.pgpMimeMessage) {
    if (!context.uploadMessage)
      throw new Error("Encrypted attachment import is unavailable.");
    const wire = buildPgpMimeMessage(
      { ...message, messageId: attempt.messageId },
      message.pgpMimeMessage,
    );
    const wireSize = new TextEncoder().encode(wire).byteLength;
    const sizeError = validateOutgoingMessageSize(
      wireSize,
      context.policy?.limits.maxMessageSizeBytes,
    );
    if (sizeError) throw new Error(sizeError);
    assertRequestBudget(
      using,
      requestCalls(message, context, {
        blobId: "x".repeat(1024),
        size: wireSize,
      }),
      context.policy,
    );
    assertMailSendCurrent(message);
    imported = await context.uploadMessage(wire);
    assertMailSendCurrent(message);
    if (
      imported.size !== wireSize ||
      !imported.blobId ||
      imported.blobId.length > 1024
    )
      throw new Error("Encrypted message upload was not confirmed.");
  }
  const sizeError =
    (imported ? null : validateOutgoingJmapMessage(message, context.policy)) ??
    (message.sentCopyCiphertext
      ? validateOutgoingJmapMessage(
          {
            subject: message.subject,
            textBody: "",
            pgpMimeCiphertext: message.sentCopyCiphertext,
          },
          context.policy,
        )
      : null);
  if (sizeError) throw new Error(sizeError);
  const calls = requestCalls(message, context, imported);
  assertRequestBudget(using, calls, context.policy);
  assertMailSendCurrent(message);
  assertRequestBudget(using, calls, context.policy);
  attempt.mayHaveSubmitted = true;
  attempt.requestedAt = Date.now();
  const envelope = await context.request(using, calls).catch(async (error: unknown) => {
    if (error instanceof JmapHttpStatusError && [400, 401, 403, 413, 429].includes(error.status)) {
      attempt.mayHaveSubmitted = false;
      throw error;
    }
    throw new Error(UNKNOWN_SUBMISSION);
  });
  assertMailSendCurrent(message);
  const importedResult = importResultSchema.safeParse(
    resultOf(envelope, "Email/import"),
  );
  const emails = sendEmailSetResultSchema.safeParse(
    imported
      ? {
          created: importedResult.success
            ? importedResult.data.created
            : undefined,
        }
      : resultOf(envelope, "Email/set"),
  );
  const created = emails.success ? emails.data.created : null;
  const failure = findJmapResponseError(envelope, "Send message");
  const submission = sendSubmissionResultSchema.safeParse(
    resultOf(envelope, "EmailSubmission/set"),
  );
  if (!submission.success) {
    const refused = z
      .object({
        notCreated: z.object({ s1: z.record(z.string(), z.unknown()) }),
      })
      .safeParse(resultOf(envelope, "EmailSubmission/set"));
    const methodRefused = envelope.methodResponses?.some(
      ([method, params, id]) =>
        method === "error" &&
        id === "c2" &&
        [
          "forbidden",
          "accountNotFound",
          "invalidArguments",
          "unknownMethod",
          "invalidResultReference",
          "accountNotSupportedByMethod",
          "accountReadOnly",
          "requestTooLarge",
        ].includes(String(params.type)),
    );
    if (refused.success || methodRefused) {
      attempt.mayHaveSubmitted = false;
      await cleanupEmails(
        message,
        context,
        [created?.draft1?.id, created?.[SENT_COPY_CREATION_ID]?.id].filter(
          (id): id is string => Boolean(id),
        ),
      ).catch(context.onCleanupError);
      throw (
        failure ?? new Error("Send message was not submitted for delivery.")
      );
    }
    throw new Error(UNKNOWN_SUBMISSION);
  }
  const stored = created?.[SENT_COPY_CREATION_ID] ?? created?.draft1;
  const receipt = {
    emailId: stored?.id ?? "",
    threadId: stored?.threadId ?? null,
    submissionId: submission.data.created.s1.id,
  };
  attempt.acknowledged = receipt;
  if (failure) context.onCleanupError(failure);
  await finishAcceptedSend(message, context).catch(context.onCleanupError);
  return receipt;
}

/** A submission receipt confirms queue acceptance; it never proves delivery to a recipient. */
export async function sendJmapMessage(
  input: OutgoingJmapMessage,
  context: SendContext,
): Promise<SentJmapMessage> {
  if (context.attempt.retired && context.attempt.authorizedCommands === 0) throw new Error("This compose session has closed.");
  const message: OutgoingJmapMessage = {
    ...input,
    isCurrent: () => !context.attempt.cancelled && (input.isCurrent?.() ?? true),
    to: [...input.to],
    cc: input.cc ? [...input.cc] : undefined,
    bcc: input.bcc ? [...input.bcc] : undefined,
    attachments: input.attachments?.map((attachment) => ({ ...attachment })),
    inReplyTo: input.inReplyTo ? [...input.inReplyTo] : undefined,
    references: input.references ? [...input.references] : undefined,
  };
  assertEncryptedMessageParts(message);
  assertMailSendCurrent(message);
  const fingerprint = await sendFingerprint(message);
  assertMailSendCurrent(message);
  if (context.attempt.inFlight) {
    if (context.attempt.fingerprint !== fingerprint)
      throw new Error("Another version is being sent. Your edits are kept.");
    return context.attempt.inFlight;
  }
  const sending = performSend(message, context, fingerprint);
  context.attempt.inFlight = sending;
  return sending.finally(() => {
    context.attempt.inFlight = null;
  });
}

export async function saveJmapDraft(
  draft: JmapDraft,
  context: {
    accountId: string;
    policy: MailServerPolicy | null;
    request: JmapRequest;
  },
): Promise<string> {
  const sizeError = validateOutgoingJmapMessage(
    {
      subject: draft.subject,
      textBody: "",
      pgpMimeCiphertext: draft.ciphertext,
    },
    context.policy,
  );
  if (sizeError) {
    throw new Error(sizeError);
  }

  const envelope = await context.request(
    MAIL_CAPABILITIES,
    buildDraftMethodCalls(draft).map(([method, params, id]) => [
      method,
      { ...params, accountId: context.accountId },
      id,
    ]),
  );
  const saved = draftSetResultSchema.safeParse(resultOf(envelope, "Email/set"));
  if (!saved.success) {
    throw (
      findJmapResponseError(envelope, "Save draft") ??
      new Error("Failed to save draft.")
    );
  }
  return saved.data.created.draft1.id;
}

export type MailMailboxRestore = {
  id: string;
  mailboxIds: Record<string, boolean>;
};

export const EMPTY_MAILBOX_BATCH_SIZE = 100;

export function buildEmailDestroyMethodCall(
  accountId: string,
  messageIds: readonly string[],
): JmapEmailSetMethodCall {
  return ["Email/set", { accountId, destroy: [...messageIds] }, "c1"];
}

export function buildEmailMoveMethodCall(
  accountId: string,
  messageIds: readonly string[],
  targetMailboxId: string,
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    messageIds.map((id) => [id, { mailboxIds: { [targetMailboxId]: true } }]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Puts each message back into exactly the mailboxes it had before a move (undo). */
export function buildEmailRestoreMailboxesMethodCall(
  accountId: string,
  restores: readonly MailMailboxRestore[],
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    restores.map(({ id, mailboxIds }) => [
      id,
      { mailboxIds: { ...mailboxIds } },
    ]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Captures current mailbox membership so a later move can be undone; skips messages with none. */
export function collectMailboxRestores(
  messages: readonly { id: string; mailboxIds?: Record<string, boolean> }[],
): MailMailboxRestore[] {
  const seen = new Set<string>();
  const restores: MailMailboxRestore[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    const mailboxIds = Object.fromEntries(
      Object.entries(message.mailboxIds ?? {}).filter(([, member]) => member),
    );
    if (Object.keys(mailboxIds).length === 0) continue;
    seen.add(message.id);
    restores.push({ id: message.id, mailboxIds });
  }
  return restores;
}

/** Destroys a mailbox's messages page by page; stops when a batch makes no progress so a refusing server cannot loop forever. */
export async function destroyMailboxMessagesInBatches(input: {
  listIds: (limit: number) => Promise<string[]>;
  destroy: (ids: string[]) => Promise<void>;
  batchSize?: number;
}): Promise<number> {
  const batchSize = input.batchSize ?? EMPTY_MAILBOX_BATCH_SIZE;
  let destroyed = 0;
  let previousBatchKey: string | null = null;

  while (true) {
    const ids = await input.listIds(batchSize);
    if (ids.length === 0) break;
    const batchKey = ids.join("\n");
    if (batchKey === previousBatchKey) break;
    previousBatchKey = batchKey;
    await input.destroy(ids);
    destroyed += ids.length;
    if (ids.length < batchSize) break;
  }

  return destroyed;
}
