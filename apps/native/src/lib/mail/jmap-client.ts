/**
 * Portable JMAP client (Stalwart) for the native app.
 *
 * Ported verbatim from the web app's `lib/mail/jmap-client.ts`. It is a pure
 * `fetch`-based client with no browser-only dependencies, so it runs unchanged
 * in React Native. Authentication uses a bearer access token minted server-side
 * (see `oauth-token-manager.ts`).
 */
import type {
  JmapEmailChanges,
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
} from "./types";
import {
  parseRecipientString,
  type ParsedMailAddress,
} from "@workspace/calendar-core";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type JmapMethodCall = [string, Record<string, unknown>, string];

type JmapEnvelope = {
  methodResponses?: [string, Record<string, unknown>, string][];
};

type JmapMethodError = {
  type?: string;
  description?: string;
  properties?: string[];
};

function getSubmissionAccountId(
  session: JmapSession,
  mailAccountId: string,
): string {
  return (
    session.primaryAccounts["urn:ietf:params:jmap:submission"] ?? mailAccountId
  );
}

function toJmapAddressList(addresses: string[]): ParsedMailAddress[] {
  return addresses.map((address) => parseRecipientString(address));
}

function formatJmapMethodError(
  methodName: string,
  error: JmapMethodError,
): string {
  const propsHint = error.properties?.length
    ? ` (properties: ${error.properties.join(", ")})`
    : "";
  const typeHint = error.type ? ` [${error.type}]` : "";
  return `${error.description || error.type || `Failed during ${methodName}`}${typeHint}${propsHint}`;
}

function assertSuccessfulJmapResponses(
  envelope: JmapEnvelope,
  context: string,
): void {
  for (const [methodName, result] of envelope.methodResponses ?? []) {
    if (methodName === "error" || methodName.endsWith("/error")) {
      const error = result as JmapMethodError;
      throw new Error(formatJmapMethodError(methodName === "error" ? context : methodName, error));
    }

    const failedPatch = (patch?: Record<string, JmapMethodError>) => {
      if (!patch || Object.keys(patch).length === 0) return null;
      return Object.values(patch)[0] ?? null;
    };

    const patchError =
      failedPatch(result.notCreated as Record<string, JmapMethodError> | undefined) ??
      failedPatch(result.notDestroyed as Record<string, JmapMethodError> | undefined) ??
      failedPatch(result.notUpdated as Record<string, JmapMethodError> | undefined);
    if (patchError) {
      throw new Error(formatJmapMethodError(methodName, patchError));
    }
  }

  if (!envelope.methodResponses?.length) {
    throw new Error(`${context}: JMAP response did not include method results.`);
  }
}

type JmapClientBearerAuthInput = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: (() => Promise<string> | string) | undefined;
  fetcher?: Fetcher;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function defaultFetcher(input: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

function rewriteOrigin(
  urlString: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!urlString) {
    return undefined;
  }

  try {
    const original = new URL(urlString);
    const replacement = new URL(baseUrl);
    const replacementPath = replacement.pathname.replace(/\/+$/, "");
    return `${replacement.origin}${replacementPath}${urlString.slice(original.origin.length)}`;
  } catch {
    return urlString;
  }
}

export function buildBearerAuthHeader(accessToken: string): string {
  return `Bearer ${accessToken.trim()}`;
}

export function normalizeJmapSession(
  session: JmapSession,
  discoveryBaseUrl: string,
): JmapSession {
  const normalizedBaseUrl = normalizeBaseUrl(discoveryBaseUrl);

  return {
    ...session,
    apiUrl: `${normalizedBaseUrl}/jmap/`,
    downloadUrl: rewriteOrigin(session.downloadUrl, normalizedBaseUrl),
    uploadUrl: rewriteOrigin(session.uploadUrl, normalizedBaseUrl),
    eventSourceUrl: rewriteOrigin(session.eventSourceUrl, normalizedBaseUrl),
  };
}

export function getPrimaryMailAccountId(
  session: Pick<JmapSession, "accounts" | "primaryAccounts">,
): string | null {
  return (
    session.primaryAccounts["urn:ietf:params:jmap:mail"] ||
    session.primaryAccounts["urn:stalwart:jmap"] ||
    Object.keys(session.accounts)[0] ||
    null
  );
}

export type JmapAttachmentInput = {
  blobId: string;
  name: string;
  type: string;
  size: number;
};

const EMAIL_GET_PROPERTIES = [
  "id",
  "threadId",
  "messageId",
  "inReplyTo",
  "references",
  "mailboxIds",
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "receivedAt",
  "keywords",
  "bodyStructure",
  "bodyValues",
  "textBody",
  "htmlBody",
  "attachments",
] as const;

function buildMessageBodyStructure(input: {
  attachments?: JmapAttachmentInput[];
  htmlBody?: string;
}): Record<string, unknown> {
  const textPart = { type: "text/plain", partId: "text" };
  const contentPart: Record<string, unknown> = input.htmlBody
    ? {
        type: "multipart/alternative",
        subParts: [textPart, { type: "text/html", partId: "html" }],
      }
    : textPart;

  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  if (!hasAttachments) {
    return contentPart;
  }

  return {
    type: "multipart/mixed",
    subParts: [
      contentPart,
      ...(input.attachments ?? []).map((attachment) => ({
        type: attachment.type,
        blobId: attachment.blobId,
        name: attachment.name,
        size: attachment.size,
        disposition: "attachment",
      })),
    ],
  };
}

function buildMessageBodyValues(input: {
  textBody: string;
  htmlBody?: string;
}): Record<string, { value: string }> {
  if (input.htmlBody) {
    return {
      text: { value: input.textBody },
      html: { value: input.htmlBody },
    };
  }
  return { text: { value: input.textBody } };
}

function buildFromHeader(
  fromEmail: string,
  fromName?: string | null,
): Array<{ email: string; name?: string }> {
  const trimmedName = fromName?.trim();
  return [
    {
      email: fromEmail,
      ...(trimmedName ? { name: trimmedName } : {}),
    },
  ];
}

export function buildSendMessageMethodCalls(input: {
  draftsMailboxId: string;
  sentMailboxId?: string | null;
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  identityId: string;
  attachments?: JmapAttachmentInput[];
  inReplyTo?: string[];
  references?: string[];
  previousDraftId?: string;
}): JmapMethodCall[] {
  const toAddresses = toJmapAddressList(input.to);
  const ccAddresses = input.cc?.length ? toJmapAddressList(input.cc) : undefined;
  const bccAddresses = input.bcc?.length
    ? toJmapAddressList(input.bcc)
    : undefined;
  const seenEnvelopeRecipients = new Set<string>();
  const envelopeRecipients: Array<{ email: string }> = [];
  for (const address of [
    ...toAddresses,
    ...(ccAddresses ?? []),
    ...(bccAddresses ?? []),
  ]) {
    if (seenEnvelopeRecipients.has(address.email)) continue;
    seenEnvelopeRecipients.add(address.email);
    envelopeRecipients.push({ email: address.email });
  }

  const submissionParams: Record<string, unknown> = {
    create: {
      s1: {
        emailId: "#draft1",
        identityId: input.identityId,
        envelope: {
          mailFrom: { email: input.fromEmail.trim() },
          rcptTo: envelopeRecipients,
        },
      },
    },
  };

  if (input.sentMailboxId) {
    submissionParams.onSuccessUpdateEmail = {
      "#s1": {
        [`mailboxIds/${input.sentMailboxId}`]: true,
        [`mailboxIds/${input.draftsMailboxId}`]: null,
        "keywords/$draft": null,
      },
    };
  }

  const emailSetArgs: Record<string, unknown> = {
    create: {
      draft1: {
        mailboxIds: {
          [input.draftsMailboxId]: true,
        },
        keywords: { $seen: true, $draft: true },
        ...(input.inReplyTo?.length ? { inReplyTo: input.inReplyTo } : {}),
        ...(input.references?.length ? { references: input.references } : {}),
        from: buildFromHeader(input.fromEmail, input.fromName),
        to: toAddresses,
        ...(ccAddresses?.length ? { cc: ccAddresses } : {}),
        ...(bccAddresses?.length ? { bcc: bccAddresses } : {}),
        subject: input.subject,
        bodyStructure: buildMessageBodyStructure(input),
        bodyValues: buildMessageBodyValues(input),
      },
    },
  };

  if (input.previousDraftId) {
    emailSetArgs.destroy = [input.previousDraftId];
  }

  return [
    ["Email/set", emailSetArgs, "c1"],
    ["EmailSubmission/set", submissionParams, "c2"],
  ];
}

export function buildDraftMethodCalls(input: {
  draftsMailboxId: string;
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  attachments?: JmapAttachmentInput[];
  previousDraftId?: string;
}): JmapMethodCall[] {
  const toAddresses = toJmapAddressList(input.to);
  const ccAddresses = input.cc?.length ? toJmapAddressList(input.cc) : undefined;
  const bccAddresses = input.bcc?.length
    ? toJmapAddressList(input.bcc)
    : undefined;

  const emailSetArgs: Record<string, unknown> = {
    create: {
      draft1: {
        mailboxIds: {
          [input.draftsMailboxId]: true,
        },
        keywords: { $draft: true },
        from: buildFromHeader(input.fromEmail, input.fromName),
        to: toAddresses,
        ...(ccAddresses?.length ? { cc: ccAddresses } : {}),
        ...(bccAddresses?.length ? { bcc: bccAddresses } : {}),
        subject: input.subject,
        bodyStructure: buildMessageBodyStructure(input),
        bodyValues: buildMessageBodyValues(input),
      },
    },
  };

  if (input.previousDraftId) {
    emailSetArgs.destroy = [input.previousDraftId];
  }

  return [["Email/set", emailSetArgs, "c1"]];
}

export class StalwartJmapClient {
  private readonly baseUrl: string;
  private readonly accessTokenProvider?: () => Promise<string> | string;
  private readonly fetcher: Fetcher;

  constructor({
    baseUrl,
    fetcher = defaultFetcher,
    ...auth
  }: JmapClientBearerAuthInput) {
    this.baseUrl = normalizeBaseUrl(baseUrl);

    const accessTokenProvider =
      auth.getAccessToken ||
      (auth.accessToken ? () => auth.accessToken as string : undefined);

    if (!accessTokenProvider) {
      throw new Error("A mail access token is required for JMAP clients.");
    }

    this.accessTokenProvider = accessTokenProvider;

    this.fetcher = fetcher;
  }

  private async getAuthorizationHeader(): Promise<string> {
    const accessToken = await this.accessTokenProvider?.();

    if (!accessToken) {
      throw new Error("No mail access token is available.");
    }

    return buildBearerAuthHeader(accessToken);
  }

  async discoverSession(): Promise<JmapSession> {
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(`${this.baseUrl}/.well-known/jmap`, {
      method: "GET",
      headers: {
        Authorization: authorization,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) detail = ` — ${body.message}`;
      } catch {
        /* ignore parse failure */
      }
      if (response.status === 401)
        throw new Error(
          "Mail sign-in expired or was rejected by the mail server.",
        );
      if (response.status === 503)
        throw new Error(`Mail server is unreachable${detail}.`);
      throw new Error(
        `Could not connect to the mail server (${response.status})${detail}.`,
      );
    }

    return normalizeJmapSession(
      (await response.json()) as JmapSession,
      this.baseUrl,
    );
  }

  async getAccountSettings(
    session: JmapSession,
  ): Promise<Record<string, unknown>> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      [["x:AccountSettings/get", { accountId, ids: ["singleton"] }, "c1"]],
    );
    const result = this.getMethodResult<{
      list?: Record<string, unknown>[];
    }>(envelope, "x:AccountSettings/get");

    return result.list?.[0] ?? { encryptionAtRest: { "@type": "Disabled" } };
  }

  async getMailboxes(session: JmapSession): Promise<JmapMailbox[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Mailbox/get",
          {
            accountId,
            properties: ["id", "name", "role", "parentId", "sortOrder"],
          },
          "c1",
        ],
      ],
    );
    const result = this.getMethodResult<{ list?: JmapMailbox[] }>(
      envelope,
      "Mailbox/get",
    );
    return result.list ?? [];
  }

  async getIdentities(session: JmapSession): Promise<JmapIdentity[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      [
        [
          "Identity/get",
          {
            accountId,
            properties: ["id", "email", "name", "textSignature", "htmlSignature"],
          },
          "c1",
        ],
      ],
    );
    const result = this.getMethodResult<{ list?: JmapIdentity[] }>(
      envelope,
      "Identity/get",
    );
    return result.list ?? [];
  }

  async getMailboxMessages(
    session: JmapSession,
    mailboxId: string,
    options: { limit?: number; position?: number } = {},
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    const { limit = 20, position = 0 } = options;
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/query",
          {
            accountId,
            filter: {
              inMailbox: mailboxId,
            },
            sort: [
              {
                property: "receivedAt",
                isAscending: false,
              },
            ],
            limit,
            position,
          },
          "q1",
        ],
        [
          "Email/get",
          {
            accountId,
            "#ids": {
              resultOf: "q1",
              name: "Email/query",
              path: "/ids",
            },
            properties: EMAIL_GET_PROPERTIES,
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            fetchAllBodyValues: true,
          },
          "g1",
        ],
      ],
    );
    const queryResult = this.getMethodResult<{
      ids?: string[];
      total?: number;
    }>(envelope, "Email/query");
    const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );

    return { messages: result.list ?? [], total: queryResult.total ?? 0 };
  }

  async searchMailboxMessages(
    session: JmapSession,
    mailboxId: string,
    query: string,
    limit = 40,
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/query",
          {
            accountId,
            filter: {
              inMailbox: mailboxId,
              text: query,
            },
            sort: [{ property: "receivedAt", isAscending: false }],
            limit,
            position: 0,
          },
          "q1",
        ],
        [
          "Email/get",
          {
            accountId,
            "#ids": {
              resultOf: "q1",
              name: "Email/query",
              path: "/ids",
            },
            properties: EMAIL_GET_PROPERTIES,
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            fetchAllBodyValues: true,
          },
          "g1",
        ],
      ],
    );
    const queryResult = this.getMethodResult<{
      ids?: string[];
      total?: number;
    }>(envelope, "Email/query");
    const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );
    return { messages: result.list ?? [], total: queryResult.total ?? 0 };
  }

  async getMessagesByIds(
    session: JmapSession,
    ids: string[],
  ): Promise<JmapEmailMessage[]> {
    if (ids.length === 0) {
      return [];
    }

    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/get",
          {
            accountId,
            ids,
            properties: EMAIL_GET_PROPERTIES,
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            fetchAllBodyValues: true,
          },
          "c1",
        ],
      ],
    );
    const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );
    return result.list ?? [];
  }

  async getThreadMessages(
    session: JmapSession,
    threadId: string,
  ): Promise<JmapEmailMessage[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const threadEnvelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Thread/get",
          {
            accountId,
            ids: [threadId],
          },
          "c1",
        ],
      ],
    );
    const threadResult = this.getMethodResult<{
      list?: { id: string; emailIds?: string[] }[];
    }>(threadEnvelope, "Thread/get");
    const emailIds = threadResult.list?.[0]?.emailIds ?? [];
    return this.getMessagesByIds(session, emailIds);
  }

  async getEmailChanges(
    session: JmapSession,
    sinceState: string,
    options: { maxChanges?: number } = {},
  ): Promise<JmapEmailChanges> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/changes",
          {
            accountId,
            sinceState,
            maxChanges: options.maxChanges ?? 500,
          },
          "c1",
        ],
      ],
    );
    const result = this.getMethodResult<Partial<JmapEmailChanges>>(
      envelope,
      "Email/changes",
    );

    return {
      oldState: result.oldState ?? sinceState,
      newState: result.newState ?? sinceState,
      hasMoreChanges: result.hasMoreChanges,
      created: result.created ?? [],
      updated: result.updated ?? [],
      destroyed: result.destroyed ?? [],
    };
  }

  async sendMessage(
    session: JmapSession,
    input: {
      draftsMailboxId: string;
      sentMailboxId: string | null;
      fromEmail: string;
      fromName?: string | null;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      textBody: string;
      htmlBody?: string;
      identityId: string;
      attachments?: JmapAttachmentInput[];
      inReplyTo?: string[];
      references?: string[];
      previousDraftId?: string;
    },
  ): Promise<{ emailId: string; threadId: string | null }> {
    const mailAccountId = this.requirePrimaryAccountId(session);
    const submissionAccountId = getSubmissionAccountId(session, mailAccountId);
    const calls = buildSendMessageMethodCalls(input).map(
      ([method, params, id]) =>
        [
          method,
          {
            ...params,
            accountId:
              method === "EmailSubmission/set"
                ? submissionAccountId
                : mailAccountId,
          },
          id,
        ] as JmapMethodCall,
    );
    const envelope = await this.call(
      session,
      [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      calls,
    );
    assertSuccessfulJmapResponses(envelope, "Send message");
    const setResult = this.getMethodResult<{
      created?: Record<string, { id?: string; threadId?: string } | null>;
    }>(envelope, "Email/set");
    const created = setResult.created?.draft1;
    if (!created?.id) {
      throw new Error("Send message succeeded but no email id was returned.");
    }
    return {
      emailId: created.id,
      threadId: created.threadId ?? null,
    };
  }

  async saveDraft(
    session: JmapSession,
    input: {
      draftsMailboxId: string;
      fromEmail: string;
      fromName?: string | null;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      textBody: string;
      htmlBody?: string;
      attachments?: JmapAttachmentInput[];
      previousDraftId?: string;
    },
  ): Promise<string> {
    const accountId = this.requirePrimaryAccountId(session);
    const calls = buildDraftMethodCalls(input).map(([method, params, id]) => [
      method,
      { ...params, accountId },
      id,
    ]) as JmapMethodCall[];
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      calls,
    );
    const setResult = this.getMethodResult<{
      created?: Record<string, { id?: string } | null>;
      notCreated?: Record<string, { description?: string }>;
    }>(envelope, "Email/set");
    const notCreated = setResult.notCreated
      ? Object.values(setResult.notCreated)[0]
      : null;
    if (notCreated) {
      throw new Error(notCreated.description ?? "Failed to save draft.");
    }
    const created = setResult.created?.draft1;
    if (!created?.id) {
      throw new Error("Failed to save draft.");
    }
    return created.id;
  }

  async moveToTrash(
    session: JmapSession,
    messageId: string,
    trashMailboxId: string | null,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    if (trashMailboxId) {
      await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        [
          [
            "Email/set",
            {
              accountId,
              update: {
                [messageId]: { mailboxIds: { [trashMailboxId]: true } },
              },
            },
            "c1",
          ],
        ],
      );
    } else {
      await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        [["Email/set", { accountId, destroy: [messageId] }, "c1"]],
      );
    }
  }

  async deleteMessage(session: JmapSession, messageId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/set", { accountId, destroy: [messageId] }, "c1"]],
    );
  }

  async moveToMailbox(
    session: JmapSession,
    messageId: string,
    targetMailboxId: string,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/set",
          {
            accountId,
            update: {
              [messageId]: { mailboxIds: { [targetMailboxId]: true } },
            },
          },
          "c1",
        ],
      ],
    );
  }

  async markAsRead(session: JmapSession, messageId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/set",
          { accountId, update: { [messageId]: { "keywords/$seen": true } } },
          "c1",
        ],
      ],
    );
  }

  async markAsUnread(session: JmapSession, messageId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/set",
          { accountId, update: { [messageId]: { "keywords/$seen": null } } },
          "c1",
        ],
      ],
    );
  }

  async bulkMoveToTrash(
    session: JmapSession,
    messageIds: string[],
    trashMailboxId: string | null,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    if (trashMailboxId) {
      const update = Object.fromEntries(
        messageIds.map((id) => [id, { mailboxIds: { [trashMailboxId]: true } }]),
      );
      await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        [["Email/set", { accountId, update }, "c1"]],
      );
    } else {
      await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        [["Email/set", { accountId, destroy: messageIds }, "c1"]],
      );
    }
  }

  async bulkMoveToMailbox(
    session: JmapSession,
    messageIds: string[],
    targetMailboxId: string,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(
      messageIds.map((id) => [id, { mailboxIds: { [targetMailboxId]: true } }]),
    );
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/set", { accountId, update }, "c1"]],
    );
  }

  async bulkMarkAsRead(
    session: JmapSession,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(
      messageIds.map((id) => [id, { "keywords/$seen": true }]),
    );
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/set", { accountId, update }, "c1"]],
    );
  }

  async bulkMarkAsUnread(
    session: JmapSession,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(
      messageIds.map((id) => [id, { "keywords/$seen": null }]),
    );
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/set", { accountId, update }, "c1"]],
    );
  }

  async toggleFlagged(
    session: JmapSession,
    messageId: string,
    flagged: boolean,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/set",
          {
            accountId,
            update: {
              [messageId]: {
                "keywords/$flagged": flagged ? true : null,
              },
            },
          },
          "c1",
        ],
      ],
    );
  }

  async setMessageLabel(
    session: JmapSession,
    messageId: string,
    labelId: string,
    assigned: boolean,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/set",
          {
            accountId,
            update: {
              [messageId]: {
                [`keywords/label:${labelId}`]: assigned ? true : null,
              },
            },
          },
          "c1",
        ],
      ],
    );
  }

  async downloadBlob(
    session: JmapSession,
    blobId: string,
    name: string,
    type: string,
  ): Promise<Uint8Array> {
    const { url, authHeader } = await this.getBlobDownloadInfo(
      session,
      blobId,
      name,
      type,
    );
    const response = await this.fetcher(url, {
      headers: { Authorization: authHeader },
    });
    if (!response.ok) {
      throw new Error(`Blob download failed with status ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async getBlobDownloadInfo(
    session: JmapSession,
    blobId: string,
    name: string,
    type: string,
  ): Promise<{ url: string; authHeader: string }> {
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.downloadUrl) {
      throw new Error("No download URL in JMAP session.");
    }
    const url = session.downloadUrl
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", encodeURIComponent(type));
    const authHeader = await this.getAuthorizationHeader();
    return { url, authHeader };
  }

  async getBlobAsText(session: JmapSession, blobId: string): Promise<string> {
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.downloadUrl) {
      throw new Error("No download URL in JMAP session.");
    }
    const url = session.downloadUrl
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", "encrypted.asc")
      .replace("{type}", encodeURIComponent("application/octet-stream"));
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(url, {
      headers: { Authorization: authorization },
    });
    if (!response.ok) {
      throw new Error(`Blob download failed with status ${response.status}.`);
    }
    return response.text();
  }

  private requirePrimaryAccountId(session: JmapSession): string {
    const accountId = getPrimaryMailAccountId(session);

    if (!accountId) {
      throw new Error("JMAP session did not include a primary mail account.");
    }

    return accountId;
  }

  private async call(
    session: JmapSession,
    using: string[],
    methodCalls: JmapMethodCall[],
  ): Promise<JmapEnvelope> {
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using,
        methodCalls,
      }),
    });

    if (!response.ok) {
      let responseBody = "";
      try {
        responseBody = await response.text();
      } catch {
        responseBody = "";
      }

      const detail = responseBody
        ? ` — ${responseBody.slice(0, 500)}`
        : "";
      throw new Error(
        `JMAP request failed with status ${response.status}${detail}.`,
      );
    }

    return (await response.json()) as JmapEnvelope;
  }

  private getMethodResult<T>(envelope: JmapEnvelope, methodName: string): T {
    const tuple = (envelope.methodResponses ?? []).find(
      (entry) => entry[0] === methodName,
    );

    if (!tuple) {
      throw new Error(`JMAP response did not include ${methodName}.`);
    }

    return tuple[1] as T;
  }
}
