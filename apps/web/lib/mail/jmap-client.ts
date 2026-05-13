import type {
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
} from "./types";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type JmapMethodCall = [string, Record<string, unknown>, string];

type JmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function defaultFetcher(input: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

function base64Encode(value: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }

  return Buffer.from(value, "utf8").toString("base64");
}

function rewriteOrigin(urlString: string | undefined, baseUrl: string): string | undefined {
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

export function buildBasicAuthHeader(email: string, password: string): string {
  return `Basic ${base64Encode(`${email}:${password}`)}`;
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

export function buildSendMessageMethodCalls(input: {
  draftsMailboxId: string;
  sentMailboxId?: string | null;
  fromEmail: string;
  to: string[];
  subject: string;
  textBody: string;
  identityId: string;
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

  return [
    [
      "Email/set",
      {
        create: {
          draft1: {
            mailboxIds: {
              [input.draftsMailboxId]: true,
            },
            from: [{ email: input.fromEmail }],
            to: input.to.map((email) => ({ email })),
            subject: input.subject,
            bodyStructure: {
              type: "text/plain",
              partId: "text",
            },
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
    [
      "EmailSubmission/set",
      submissionParams,
      "c2",
    ],
  ];
}

export class StalwartJmapClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor({
    baseUrl,
    email,
    password,
    fetcher = defaultFetcher,
  }: {
    baseUrl: string;
    email: string;
    password: string;
    fetcher?: Fetcher;
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.authHeader = buildBasicAuthHeader(email, password);
    this.fetcher = fetcher;
  }

  private readonly fetcher: Fetcher;

  async discoverSession(): Promise<JmapSession> {
    const response = await this.fetcher(`${this.baseUrl}/.well-known/jmap`, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json() as { message?: string };
        if (body.message) detail = ` — ${body.message}`;
      } catch { /* ignore parse failure */ }
      if (response.status === 401) throw new Error("Incorrect password or mailbox not found.");
      if (response.status === 503) throw new Error(`Mail server is unreachable${detail}.`);
      throw new Error(`Could not connect to the mail server (${response.status})${detail}.`);
    }

    return normalizeJmapSession((await response.json()) as JmapSession, this.baseUrl);
  }

  async getAccountSettings(session: JmapSession): Promise<Record<string, unknown>> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], [
      ["x:AccountSettings/get", { accountId, ids: ["singleton"] }, "c1"],
    ]);
    const result = this.getMethodResult<{ list?: Array<Record<string, unknown>> }>(
      envelope,
      "x:AccountSettings/get",
    );

    return result.list?.[0] ?? { encryptionAtRest: { "@type": "Disabled" } };
  }

  async getMailboxes(session: JmapSession): Promise<JmapMailbox[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Mailbox/get", { accountId, properties: ["id", "name", "role", "parentId", "sortOrder"] }, "c1"],
    ]);
    const result = this.getMethodResult<{ list?: JmapMailbox[] }>(envelope, "Mailbox/get");
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
    limit = 50,
  ): Promise<JmapEmailMessage[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
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
           properties: [
             "id",
             "threadId",
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
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          fetchAllBodyValues: true,
        },
        "g1",
      ],
    ]);
    const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );

    return result.list ?? [];
  }

  async sendMessage(
    session: JmapSession,
    input: {
      draftsMailboxId: string;
      sentMailboxId: string | null;
      fromEmail: string;
      to: string[];
      subject: string;
      textBody: string;
      identityId: string;
    },
  ): Promise<void> {
    await this.call(
      session,
      [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      buildSendMessageMethodCalls(input),
    );
  }

  async moveToTrash(
    session: JmapSession,
    messageId: string,
    trashMailboxId: string | null,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    if (trashMailboxId) {
      await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
        ["Email/set", { accountId, update: { [messageId]: { mailboxIds: { [trashMailboxId]: true } } } }, "c1"],
      ]);
    } else {
      await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
        ["Email/set", { accountId, destroy: [messageId] }, "c1"],
      ]);
    }
  }

  async updateMailboxSortOrders(
    session: JmapSession,
    updates: { id: string; sortOrder: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(updates.map(({ id, sortOrder }) => [id, { sortOrder }]));
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Mailbox/set", { accountId, update }, "c1"],
    ]);
  }

  async createMailbox(session: JmapSession, name: string): Promise<JmapMailbox> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Mailbox/set", { accountId, create: { new: { name } } }, "c1"],
    ]);
    const result = this.getMethodResult<{ created?: Record<string, JmapMailbox> }>(envelope, "Mailbox/set");
    const created = result.created?.new;
    if (!created) throw new Error("Mailbox was not created.");
    return { ...created, name };
  }

  async deleteMailbox(session: JmapSession, mailboxId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Mailbox/set", { accountId, destroy: [mailboxId] }, "c1"],
    ]);
  }

  async moveToMailbox(
    session: JmapSession,
    messageId: string,
    targetMailboxId: string,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update: { [messageId]: { mailboxIds: { [targetMailboxId]: true } } } }, "c1"],
    ]);
  }

  async markAsRead(session: JmapSession, messageId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update: { [messageId]: { "keywords/$seen": true } } }, "c1"],
    ]);
  }

  async markAsUnread(session: JmapSession, messageId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update: { [messageId]: { "keywords/$seen": null } } }, "c1"],
    ]);
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
      await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
        ["Email/set", { accountId, update }, "c1"],
      ]);
    } else {
      await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
        ["Email/set", { accountId, destroy: messageIds }, "c1"],
      ]);
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
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update }, "c1"],
    ]);
  }

  async bulkMarkAsRead(session: JmapSession, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(messageIds.map((id) => [id, { "keywords/$seen": true }]));
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update }, "c1"],
    ]);
  }

  async bulkMarkAsUnread(session: JmapSession, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(messageIds.map((id) => [id, { "keywords/$seen": null }]));
    await this.call(session, ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], [
      ["Email/set", { accountId, update }, "c1"],
    ]);
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
    const response = await this.fetcher(url, {
      headers: { Authorization: this.authHeader },
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
    const response = await this.fetcher(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
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
