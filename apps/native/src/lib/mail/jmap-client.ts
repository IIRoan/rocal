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

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type JmapMethodCall = [string, Record<string, unknown>, string];

type JmapEnvelope = {
  methodResponses?: [string, Record<string, unknown>, string][];
};

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

export function buildSendMessageMethodCalls(input: {
  draftsMailboxId: string;
  sentMailboxId?: string | null;
  fromEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  identityId: string;
  attachments?: JmapAttachmentInput[];
  inReplyTo?: string[];
  references?: string[];
}): JmapMethodCall[] {
  const submissionParams: Record<string, unknown> = {
    create: {
      s1: {
        emailId: "#draft1",
        identityId: input.identityId,
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

  const hasAttachments = (input.attachments?.length ?? 0) > 0;

  const bodyStructure: Record<string, unknown> = hasAttachments
    ? {
        type: "multipart/mixed",
        subParts: [
          { type: "text/plain", partId: "text" },
          ...(input.attachments ?? []).map((a) => ({
            type: a.type,
            blobId: a.blobId,
            name: a.name,
            size: a.size,
            disposition: "attachment",
          })),
        ],
      }
    : { type: "text/plain", partId: "text" };

  return [
    [
      "Email/set",
      {
        create: {
          draft1: {
            mailboxIds: {
              [input.draftsMailboxId]: true,
            },
            ...(input.inReplyTo?.length ? { inReplyTo: input.inReplyTo } : {}),
            ...(input.references?.length
              ? { references: input.references }
              : {}),
            from: [{ email: input.fromEmail }],
            to: input.to.map((email) => ({ email })),
            ...(input.cc?.length
              ? { cc: input.cc.map((email) => ({ email })) }
              : {}),
            ...(input.bcc?.length
              ? { bcc: input.bcc.map((email) => ({ email })) }
              : {}),
            subject: input.subject,
            bodyStructure,
            bodyValues: {
              text: {
                value: input.textBody,
              },
            },
          },
        },
      },
      "c1",
    ],
    ["EmailSubmission/set", submissionParams, "c2"],
  ];
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
            properties: ["id", "email", "name"],
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
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      textBody: string;
      identityId: string;
      attachments?: JmapAttachmentInput[];
      inReplyTo?: string[];
      references?: string[];
    },
  ): Promise<{ emailId: string; threadId: string | null }> {
    const envelope = await this.call(
      session,
      [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      buildSendMessageMethodCalls(input),
    );
    const setResult = this.getMethodResult<{
      created?: Record<string, { id?: string; threadId?: string } | null>;
    }>(envelope, "Email/set");
    const created = setResult.created?.draft1;
    return {
      emailId: created?.id ?? "",
      threadId: created?.threadId ?? null,
    };
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
      throw new Error(`JMAP request failed with status ${response.status}.`);
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
