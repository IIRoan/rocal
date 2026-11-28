import { JmapMailClient, type JmapEnvelope } from "@workspace/calendar-client/jmap-mail-client";
import type {
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
} from "./types";
import {
  buildBearerAuthHeader,
  getSubmissionAccountId,
  normalizeJmapSession,
  type JmapMethodCallLike as JmapMethodCall,
  sendJmapMessage,
  getMailSendAttemptStore,
  assertMailSendCurrent,
  withMailSendCommand,
  JmapHttpStatusError,
  type ScopedOutgoingJmapMessage,
  type JmapAttachmentInput,
  type JmapPgpMimeCiphertext,
  type SentJmapMessage,
  parseJmapBlobUploadResponse,
  validateUploadedBlob,
  type PreparedOutgoingAttachment,
  chunkArray,
  runTasksWithConcurrencyLimit,
  resolveMailboxMessagesPageSize,
  STALWART_EMAIL_POLICY_PROPERTIES,
  STALWART_JMAP_POLICY_PROPERTIES,
  DEFAULT_JMAP_UPLOAD_TTL_MS,
  MailBlobUploadRegistry,
  chunkJmapMethodCalls,
  isBlobUploadExpired,
  jmapMethodCallsHaveDependencies,
  extractTextQueryFromJmapFilter,
  toJmapTextQuery,
  type MailMessageFlags,
  AUTH_RESULTS_JMAP_PROPERTY,
  LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY,
  SIMPLELOGIN_JMAP_PROPERTIES,
  type MailboxNameCipher,
} from "@workspace/calendar-core";
import { sanitizeContext } from "@workspace/calendar-core/report-redaction";
import { createLogger } from "@workspace/logger";
import { trimTrailingSlashes } from "@workspace/runtime";
import { getMailboxNameCipher } from "./mailbox-name-cipher";

export { buildBearerAuthHeader, getPrimaryMailAccountId, normalizeJmapSession } from "@workspace/calendar-core";

const log = createLogger("mail-jmap");

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Hostile JMAP bodies: only trust a session that carries the account maps we index into. */
function isJmapSessionRecord(value: unknown): value is JmapSession {
  const record = asRecord(value);
  return (
    asRecord(record?.accounts) !== null &&
    asRecord(record?.primaryAccounts) !== null
  );
}

function isJmapEnvelopeRecord(value: unknown): value is JmapEnvelope {
  const record = asRecord(value);
  return (
    record !== null &&
    (record.methodResponses === undefined ||
      Array.isArray(record.methodResponses))
  );
}

type JmapClientBearerAuthInput = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: (() => Promise<string> | string) | undefined;
  onUnauthorized?: () => void | Promise<void>;
  fetcher?: Fetcher;
  getMailboxNameCipher?: () => Promise<MailboxNameCipher | null>;
};

function defaultFetcher(input: string, init?: RequestInit): Promise<Response> {
  // repo-rules-allow client-api-boundary: JMAP protocol transport to the mail server, not a Solace API route.
  return globalThis.fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
  });
}

async function readHttpErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.clone().text();
    if (!text) {
      return "";
    }

    try {
      const parsed = asRecord(JSON.parse(text));
      const parts = [
        typeof parsed?.message === "string" ? parsed.message : null,
        typeof parsed?.title === "string" ? parsed.title : null,
        typeof parsed?.detail === "string" ? parsed.detail : null,
        typeof parsed?.error === "string" ? parsed.error : null,
      ].filter((part): part is string => Boolean(part));

      if (parts.length > 0) {
        return parts.join(" — ");
      }
    } catch {
      // Fall through to raw body snippet.
    }

    return text.slice(0, 500);
  } catch {
    return "";
  }
}

function formatHttpStatusError(
  label: string,
  status: number,
  detail: string,
): string {
  return detail
    ? `${label} failed with status ${status}: ${detail}`
    : `${label} failed with status ${status}.`;
}

const EMAIL_LIST_GET_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "keywords",
  "size",
  "receivedAt",
  "from",
  "to",
  "cc",
  "subject",
  "preview",
  "hasAttachment",
  // Intentionally omit bodyStructure: Stalwart encryption-at-rest makes
  // MIME-tree fetches touch blobs for every list row (1–3s through the proxy).
  // Full bodyStructure is loaded when a message is opened.
] as const;

const EMAIL_FULL_GET_PROPERTIES = [
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
  ...SIMPLELOGIN_JMAP_PROPERTIES,
  LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY,
  AUTH_RESULTS_JMAP_PROPERTY,
  "header:Received",
  "header:DKIM-Signature",
] as const;

export type GetMessagesOptions = {
  /** When false, only list-preview metadata is fetched (no MIME/blob work). Default true. */
  includeBodies?: boolean;
};

export class StalwartJmapClient extends JmapMailClient {
  private readonly baseUrl: string;
  private readonly accessTokenProvider?: () => Promise<string> | string;
  private readonly onUnauthorized?: () => void | Promise<void>;
  private readonly fetcher: Fetcher;
  private readonly blobUploadRegistry = new MailBlobUploadRegistry();
  private cachedSession: JmapSession | null = null;
  private discoverSessionInflight: Promise<JmapSession> | null = null;

  constructor({
    baseUrl,
    fetcher = defaultFetcher,
    onUnauthorized,
    getMailboxNameCipher: mailboxNameCipher = getMailboxNameCipher,
    ...auth
  }: JmapClientBearerAuthInput) {
    super(mailboxNameCipher, log);
    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.onUnauthorized = onUnauthorized;

    const accessTokenProvider =
      auth.getAccessToken ||
      (auth.accessToken ? () => auth.accessToken as string : undefined);

    if (!accessTokenProvider) {
      throw new Error("A mail access token is required for JMAP clients.");
    }

    this.accessTokenProvider = accessTokenProvider;

    this.fetcher = fetcher;
  }

  protected getDefaultMailboxPageSize(): number {
    return this.mailServerPolicy
      ? resolveMailboxMessagesPageSize(this.mailServerPolicy, 25)
      : 25;
  }

  private getUploadTtlMs(): number {
    return this.mailServerPolicy?.uploadTtlMs ?? DEFAULT_JMAP_UPLOAD_TTL_MS;
  }

  /** Re-uploads only this message's expired blobs, so attachments from earlier plaintext sends never return to the server. */
  private async refreshRegisteredBlobUploads(
    session: JmapSession,
    blobIds: string[],
    isCurrent?: () => boolean,
  ): Promise<void> {
    assertMailSendCurrent({ isCurrent });
    const uploadTtlMs = this.getUploadTtlMs();
    const now = Date.now();
    const records = new Set(
      blobIds.flatMap((blobId) => this.blobUploadRegistry.get(blobId) ?? []),
    );

    await runTasksWithConcurrencyLimit(
      [...records].map((record) => async () => {
        assertMailSendCurrent({ isCurrent });
        if (!isBlobUploadExpired(record.uploadedAt, uploadTtlMs, now)) {
          return;
        }

        const refreshed =
          record.source.kind === "text"
            ? await this.uploadBlob(
                session,
                new Blob([record.source.text], {
                  type: record.source.contentType ?? "application/octet-stream",
                }),
                record.source.contentType ?? "application/octet-stream",
                true, isCurrent,
              )
            : await this.uploadBlob(
                session,
                new Blob([record.source.content.slice()], {
                  type: record.source.contentType,
                }),
                record.source.contentType,
                true, isCurrent,
              );

        assertMailSendCurrent({ isCurrent });
        this.blobUploadRegistry.replaceBlobId(record.blobId, {
          blobId: refreshed.blobId,
          size: refreshed.size,
          uploadedAt: Date.now(),
        });
      }),
      this.mailServerPolicy?.maxConcurrentUploads ?? 1,
    );
  }

  private async refreshOutgoingBlobReferences(
    session: JmapSession,
    input: {
      attachments?: JmapAttachmentInput[];
      pgpMimeCiphertext?: JmapPgpMimeCiphertext;
      isCurrent?: () => boolean;
    },
  ): Promise<{
    attachments?: JmapAttachmentInput[];
    pgpMimeCiphertext?: JmapPgpMimeCiphertext;
  }> {
    assertMailSendCurrent(input);
    if (!input.attachments?.length && !input.pgpMimeCiphertext) {
      return input;
    }

    await this.refreshRegisteredBlobUploads(session, [
      ...(input.attachments ?? []).map((attachment) => attachment.blobId),
      ...(input.pgpMimeCiphertext ? [input.pgpMimeCiphertext.blobId] : []),
    ], input.isCurrent);
    assertMailSendCurrent(input);

    const attachments = input.attachments?.map((attachment) => {
      const refreshed = this.blobUploadRegistry.get(attachment.blobId);
      if (!refreshed) {
        return attachment;
      }
      return {
        ...attachment,
        blobId: refreshed.blobId,
        size: refreshed.size,
        type: refreshed.type,
      };
    });

    const pgpRecord = input.pgpMimeCiphertext
      ? this.blobUploadRegistry.get(input.pgpMimeCiphertext.blobId)
      : null;

    return {
      attachments,
      pgpMimeCiphertext: input.pgpMimeCiphertext
        ? {
            blobId: pgpRecord?.blobId ?? input.pgpMimeCiphertext.blobId,
            size: pgpRecord?.size ?? input.pgpMimeCiphertext.size,
          }
        : undefined,
    };
  }

  private async getAuthorizationHeader(): Promise<string> {
    const accessToken = await this.accessTokenProvider?.();

    if (!accessToken) {
      throw new Error("No mail access token is available.");
    }

    return buildBearerAuthHeader(accessToken);
  }

  async discoverSession(): Promise<JmapSession> {
    if (this.cachedSession) {
      return this.cachedSession;
    }
    if (this.discoverSessionInflight) {
      return this.discoverSessionInflight;
    }

    this.discoverSessionInflight = this.discoverSessionWithRetry(true)
      .then((session) => {
        this.cachedSession = session;
        return session;
      })
      .finally(() => {
        this.discoverSessionInflight = null;
      });

    return this.discoverSessionInflight;
  }

  /** Drop cached JMAP session (e.g. after auth refresh). */
  clearCachedSession(): void {
    this.cachedSession = null;
    this.discoverSessionInflight = null;
  }

  private async discoverSessionWithRetry(
    allowRetry: boolean,
  ): Promise<JmapSession> {
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(`${this.baseUrl}/.well-known/jmap`, {
      method: "GET",
      headers: {
        Authorization: authorization,
      },
      redirect: "follow",
    });

    if (response.status === 401 && allowRetry) {
      this.clearCachedSession();
      await this.onUnauthorized?.();
      return this.discoverSessionWithRetry(false);
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = asRecord(await response.json());
        if (typeof body?.message === "string" && body.message) {
          detail = ` — ${body.message}`;
        }
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

    const session = await response.json();
    if (!isJmapSessionRecord(session)) {
      throw new Error("Mail server returned an unreadable JMAP session.");
    }

    return normalizeJmapSession(session, this.baseUrl);
  }

  /** One round-trip for bootstrap metadata; policy singletons are optional and must not fail mailbox load. */
  async bootstrapMailboxState(session: JmapSession): Promise<{
    accountSettings: Record<string, unknown>;
    emailSettings: Record<string, unknown> | null;
    jmapSettings: Record<string, unknown> | null;
    mailboxes: JmapMailbox[];
    identities: JmapIdentity[];
  }> {
    try {
      return await this.bootstrapMailboxStateBatched(session);
    } catch (error) {
      log.warn(
        "Batched mailbox bootstrap failed; falling back to parallel calls",
        { error },
      );
      const [accountSettings, stalwartPolicy, mailboxes, identities] =
        await Promise.all([
          this.getAccountSettings(session),
          this.getStalwartPolicySingletons(session),
          this.getMailboxes(session),
          this.getIdentities(session),
        ]);
      return {
        accountSettings,
        emailSettings: stalwartPolicy.emailSettings,
        jmapSettings: stalwartPolicy.jmapSettings,
        mailboxes,
        identities,
      };
    }
  }

  private async bootstrapMailboxStateBatched(session: JmapSession): Promise<{
    accountSettings: Record<string, unknown>;
    emailSettings: Record<string, unknown> | null;
    jmapSettings: Record<string, unknown> | null;
    mailboxes: JmapMailbox[];
    identities: JmapIdentity[];
  }> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
        "urn:stalwart:jmap",
      ],
      [
        ["x:AccountSettings/get", { accountId, ids: ["singleton"] }, "as1"],
        [
          "x:Email/get",
          {
            ids: ["singleton"],
            properties: [...STALWART_EMAIL_POLICY_PROPERTIES],
          },
          "e1",
        ],
        [
          "x:Jmap/get",
          {
            ids: ["singleton"],
            properties: [...STALWART_JMAP_POLICY_PROPERTIES],
          },
          "j1",
        ],
        [
          "Mailbox/get",
          {
            accountId,
            properties: ["id", "name", "role", "parentId", "sortOrder"],
          },
          "m1",
        ],
        [
          "Identity/get",
          {
            accountId,
            properties: [
              "id",
              "email",
              "name",
              "textSignature",
              "htmlSignature",
            ],
          },
          "i1",
        ],
      ],
    );

    const accountSettings = this.getMethodResult<{
      list?: Array<Record<string, unknown>>;
    }>(envelope, "x:AccountSettings/get").list?.[0] ?? {
      encryptionAtRest: { "@type": "Disabled" },
    };
    // Soft — matches getStalwartPolicySingletons() try/catch behavior.
    const emailSettings = this.tryGetMethodListItem(envelope, "x:Email/get");
    const jmapSettings = this.tryGetMethodListItem(envelope, "x:Jmap/get");
    const mailboxes = await this.readMailboxes(
      session,
      this.getMethodResult<{ list?: JmapMailbox[] }>(envelope, "Mailbox/get")
        .list ?? [],
    );
    const identities =
      this.getMethodResult<{ list?: JmapIdentity[] }>(envelope, "Identity/get")
        .list ?? [];

    return {
      accountSettings,
      emailSettings,
      jmapSettings,
      mailboxes,
      identities,
    };
  }

  async getMailboxMessages(
    session: JmapSession,
    mailboxId: string,
    options: { limit?: number; position?: number } = {},
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    const { limit = this.getDefaultMailboxPageSize(), position = 0 } = options;
    return this.queryMessages(
      session,
      { filter: { inMailbox: mailboxId }, limit, position },
      { properties: EMAIL_LIST_GET_PROPERTIES },
    );
  }

  async searchMailboxMessages(
    session: JmapSession,
    mailboxId: string,
    query: string,
    limit = this.getDefaultSearchPageSize(),
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    return this.queryMessages(
      session,
      { filter: { inMailbox: mailboxId, text: toJmapTextQuery(query) }, limit, position: 0 },
      { properties: EMAIL_LIST_GET_PROPERTIES },
      query,
    );
  }

  async searchMailboxMessagesWithFilter(
    session: JmapSession,
    mailboxId: string,
    filter: Record<string, unknown>,
    limit = this.getDefaultSearchPageSize(),
    position = 0,
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    return this.queryMessages(
      session,
      {
        filter: filter.inMailbox || filter.operator ? filter : { inMailbox: mailboxId, ...filter },
        limit,
        position,
        calculateTotal: true,
      },
      { properties: EMAIL_LIST_GET_PROPERTIES },
      extractTextQueryFromJmapFilter(filter),
    );
  }

  async getMailboxMessagesForThread(
    session: JmapSession,
    mailboxIds: string[],
    threadIds: string[],
    limit = 50,
  ): Promise<JmapEmailMessage[]> {
    if (threadIds.length === 0 || mailboxIds.length === 0) return [];
    const accountId = this.requirePrimaryAccountId(session);

    const allFilterConditions = mailboxIds.map((id) => ({
      inMailbox: id,
    }));

    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/query",
          {
            accountId,
            filter: {
              operator: "AND",
              conditions: [
                { operator: "OR", conditions: allFilterConditions },
                {
                  operator: "OR",
                  conditions: threadIds.map((tid) => ({ threadId: tid })),
                },
              ],
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
            properties: [...EMAIL_LIST_GET_PROPERTIES],
          },
          "g1",
        ],
      ],
    );
    const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
      envelope,
      "Email/get",
    );
    return result.list ?? [];
  }

  async getMailboxMessagesByIds(
    session: JmapSession,
    mailboxIds: string[],
    options: { limit?: number; position?: number } = {},
  ): Promise<{ messages: JmapEmailMessage[]; total: number }> {
    if (mailboxIds.length === 0) return { messages: [], total: 0 };
    const { limit = this.getDefaultMailboxPageSize(), position = 0 } = options;
    const accountId = this.requirePrimaryAccountId(session);

    const conditions = mailboxIds.map((id) => ({ inMailbox: id }));

    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/query",
          {
            accountId,
            filter:
              conditions.length === 1
                ? conditions[0]
                : { operator: "OR", conditions },
            sort: [{ property: "receivedAt", isAscending: false }],
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
            properties: [...EMAIL_LIST_GET_PROPERTIES],
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

  async getMailboxMessagesForIndex(
    session: JmapSession,
    mailboxId: string,
    options: { limit?: number; position?: number } = {},
  ): Promise<{
    messages: JmapEmailMessage[];
    total: number;
    queryState?: string;
  }> {
    const { ids, total, queryState } = await this.getMailboxMessageIds(
      session,
      mailboxId,
      options,
    );
    const messages = await this.getMessagesByIds(session, ids, {
      includeBodies: true,
    });
    return { messages, total, queryState };
  }

  /** A mailbox's newest ids with only their read, flag and folder state, so a list already held refreshes without downloading it again. */
  async getMailboxMessageFlags(
    session: JmapSession,
    mailboxId: string,
    options: { limit: number },
  ): Promise<{ flags: MailMessageFlags[]; total: number }> {
    const accountId = this.requirePrimaryAccountId(session);
    const limit = Math.min(options.limit, this.getEmailGetChunkSize());
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Email/query",
          {
            accountId,
            filter: { inMailbox: mailboxId },
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
            "#ids": { resultOf: "q1", name: "Email/query", path: "/ids" },
            properties: ["id", "keywords", "mailboxIds"],
          },
          "g1",
        ],
      ],
    );
    const query = this.getMethodResult<{ ids?: string[]; total?: number }>(envelope, "Email/query");
    const got = this.getMethodResult<{ list?: MailMessageFlags[] }>(envelope, "Email/get");
    const byId = new Map((got.list ?? []).map((entry) => [entry.id, entry]));
    const flags = (query.ids ?? []).flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    });
    return { flags, total: query.total ?? 0 };
  }

  async getMessagesByIds(
    session: JmapSession,
    ids: string[],
    options: GetMessagesOptions = {},
  ): Promise<JmapEmailMessage[]> {
    if (ids.length === 0) {
      return [];
    }

    const includeBodies = options.includeBodies ?? true;
    const accountId = this.requirePrimaryAccountId(session);
    const chunkSize = this.getEmailGetChunkSize();
    const results = await Promise.all(
      chunkArray(ids, chunkSize).map(async (chunk) => {
        const envelope = await this.call(
          session,
          ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          [
            [
              "Email/get",
              {
                accountId,
                ids: chunk,
                properties: [
                  ...(includeBodies
                    ? EMAIL_FULL_GET_PROPERTIES
                    : EMAIL_LIST_GET_PROPERTIES),
                ],
                ...(includeBodies
                  ? {
                      fetchTextBodyValues: true,
                      fetchHTMLBodyValues: true,
                    }
                  : {}),
              },
              "c1",
            ],
          ],
        );
        return this.getMethodResult<{ list?: JmapEmailMessage[] }>(
          envelope,
          "Email/get",
        );
      }),
    );

    return results.flatMap((result) => result.list ?? []);
  }

  async getThreadMessages(
    session: JmapSession,
    threadId: string,
  ): Promise<JmapEmailMessage[]> {
    const emailIds = await this.getThreadMessageIds(session, threadId);
    return this.getMessagesByIds(session, emailIds, { includeBodies: false });
  }

  async uploadBlob(
    session: JmapSession,
    blob: Blob,
    contentType: string,
    allowRetry = true,
    isCurrent?: () => boolean,
  ): Promise<{ blobId: string; size: number; type: string }> {
    assertMailSendCurrent({ isCurrent });
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.uploadUrl) {
      throw new Error("No upload URL in JMAP session.");
    }
    const url = session.uploadUrl.replace(
      "{accountId}",
      encodeURIComponent(accountId),
    );
    const authorization = await this.getAuthorizationHeader();
    assertMailSendCurrent({ isCurrent });
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": contentType,
      },
      body: blob,
    });

    assertMailSendCurrent({ isCurrent });
    if (response.status === 401 && allowRetry) {
      log.warn(
        "Blob upload rejected with 401; clearing auth and retrying once",
        {
          url,
          contentType,
          blobSize: blob.size,
        },
      );
      await this.onUnauthorized?.();
      return this.uploadBlob(session, blob, contentType, false, isCurrent);
    }

    if (!response.ok) {
      const detail = await readHttpErrorDetail(response);
      log.error("Blob upload failed", {
        status: response.status,
        url,
        contentType,
        blobSize: blob.size,
        detail,
        retriedAfterUnauthorized: !allowRetry,
      });
      throw new Error(
        formatHttpStatusError("Blob upload", response.status, detail),
      );
    }
    const json = await response.json();
    assertMailSendCurrent({ isCurrent });
    const validated = parseJmapBlobUploadResponse(
      json,
      blob.size,
      "Blob upload",
    );
    return {
      blobId: validated.blobId,
      size: validated.size,
      type: validated.type || contentType,
    };
  }

  async uploadPreparedAttachment(
    session: JmapSession,
    attachment: PreparedOutgoingAttachment,
    isCurrent?: () => boolean,
  ): Promise<JmapAttachmentInput> {
    assertMailSendCurrent({ isCurrent });
    const blob = new Blob([attachment.content.slice()], {
      type: attachment.contentType,
    });
    const uploaded = await this.uploadBlob(
      session,
      blob,
      attachment.contentType,
      true, isCurrent,
    );
    assertMailSendCurrent({ isCurrent });
    const validated = validateUploadedBlob({
      blobId: uploaded.blobId,
      size: uploaded.size,
      expectedSize: attachment.size,
      label: attachment.filename,
    });
    const result = {
      blobId: validated.blobId,
      name: attachment.filename,
      type: uploaded.type,
      size: validated.size,
    };
    this.blobUploadRegistry.register({
      blobId: result.blobId,
      size: result.size,
      type: result.type,
      name: result.name,
      uploadedAt: Date.now(),
      source: {
        kind: "bytes",
        content: attachment.content,
        contentType: attachment.contentType,
        filename: attachment.filename,
      },
    });
    return result;
  }

  async uploadPreparedAttachments(
    session: JmapSession,
    attachments: PreparedOutgoingAttachment[],
  ): Promise<JmapAttachmentInput[]> {
    if (attachments.length === 0) {
      return [];
    }

    const concurrency =
      this.mailServerPolicy?.maxConcurrentUploads ?? attachments.length;

    return runTasksWithConcurrencyLimit(
      attachments.map(
        (attachment) => () =>
          this.uploadPreparedAttachment(session, attachment),
      ),
      concurrency,
    );
  }

  async uploadTextBlob(
    session: JmapSession,
    text: string,
    contentType = "application/octet-stream",
  ): Promise<{ blobId: string; size: number; type: string }> {
    const blob = new Blob([text], { type: contentType });
    const uploaded = await this.uploadBlob(session, blob, contentType);
    this.blobUploadRegistry.register({
      blobId: uploaded.blobId,
      size: uploaded.size,
      type: uploaded.type,
      uploadedAt: Date.now(),
      source: { kind: "text", text, contentType },
    });
    return uploaded;
  }

  async sendMessage(
    session: JmapSession,
    input: ScopedOutgoingJmapMessage,
  ): Promise<SentJmapMessage> {
    assertMailSendCurrent(input);
    const attempt = getMailSendAttemptStore(this.requirePrimaryAccountId(session)).get(input.sendScope, input.fromEmail);
    return withMailSendCommand(attempt, async () => {
      const guardedInput = { ...input, isCurrent: () => !attempt.cancelled && (input.isCurrent?.() ?? true) };
      await this.syncMailServerPolicy(session);
      assertMailSendCurrent(guardedInput);

      const refreshed = await this.refreshOutgoingBlobReferences(session, guardedInput);
      assertMailSendCurrent(guardedInput);
      const mailAccountId = this.requirePrimaryAccountId(session);
      return sendJmapMessage(
        { ...guardedInput, ...refreshed },
        {
          attempt,
          mailAccountId,
          submissionAccountId: getSubmissionAccountId(session, mailAccountId),
          policy: this.mailServerPolicy,
          request: (using, calls) => this.call(session, using, calls, true, guardedInput.isCurrent),
          uploadMessage: (wire) =>
            this.uploadBlob(
              session,
              new Blob([wire], { type: "message/rfc822" }),
              "message/rfc822",
              true, guardedInput.isCurrent,
            ),
          onCleanupError: (error) => {
            log.warn("Sent mail cleanup failed", sanitizeContext({ error }));
          },
        },
      );
    });
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
    const response = await this.authorizedBlobFetch(url);

    if (!response.ok) {
      const detail = await readHttpErrorDetail(response);
      throw new Error(
        formatHttpStatusError("Blob download", response.status, detail),
      );
    }
    return response.text();
  }

  async downloadBlob(
    session: JmapSession,
    blobId: string,
    name: string,
    type: string,
  ): Promise<Blob> {
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.downloadUrl) {
      throw new Error("No download URL in JMAP session.");
    }
    const url = session.downloadUrl
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", encodeURIComponent(type));
    const response = await this.authorizedBlobFetch(url);

    if (!response.ok) {
      const detail = await readHttpErrorDetail(response);
      throw new Error(
        formatHttpStatusError("Blob download", response.status, detail),
      );
    }
    return response.blob();
  }

  private async authorizedBlobFetch(
    url: string,
    allowRetry = true,
  ): Promise<Response> {
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(url, {
      headers: { Authorization: authorization },
    });

    if (response.status === 401 && allowRetry) {
      log.warn(
        "Blob download rejected with 401; clearing auth and retrying once",
        {
          url,
        },
      );
      await this.onUnauthorized?.();
      return this.authorizedBlobFetch(url, false);
    }

    return response;
  }

  protected async call(
    session: JmapSession,
    capabilities: string[],
    methodCalls: JmapMethodCall[],
    allowRetry = true,
    isCurrent?: () => boolean,
  ): Promise<JmapEnvelope> {
    const maxMethodCalls = this.getMaxMethodCalls();
    if (
      methodCalls.length <= maxMethodCalls ||
      jmapMethodCallsHaveDependencies(methodCalls)
    ) {
      return this.executeCall(session, capabilities, methodCalls, allowRetry, isCurrent);
    }

    // Chunks only run when no call references another's result, so the requests are independent.
    const envelopes = await Promise.all(
      chunkJmapMethodCalls(methodCalls, maxMethodCalls).map((chunk) =>
        this.executeCall(session, capabilities, chunk, allowRetry, isCurrent),
      ),
    );
    return {
      methodResponses: envelopes.flatMap(
        (envelope) => envelope.methodResponses ?? [],
      ),
    };
  }

  private async executeCall(
    session: JmapSession,
    capabilities: string[],
    methodCalls: JmapMethodCall[],
    allowRetry = true,
    isCurrent?: () => boolean,
  ): Promise<JmapEnvelope> {
    assertMailSendCurrent({ isCurrent });
    const authorization = await this.getAuthorizationHeader();
    assertMailSendCurrent({ isCurrent });
    const response = await this.fetcher(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: capabilities,
        methodCalls,
      }),
    });

    if (response.status === 401 && allowRetry && !methodCalls.some(([method]) => method === "EmailSubmission/set")) {
      log.warn(
        "JMAP request rejected with 401; clearing auth and retrying once",
        {
          apiUrl: session.apiUrl,
          methods: methodCalls.map(([method]) => method),
        },
      );
      await this.onUnauthorized?.();
      return this.executeCall(session, capabilities, methodCalls, false, isCurrent);
    }

    assertMailSendCurrent({ isCurrent });
    if (!response.ok) {
      const detail = await readHttpErrorDetail(response);
      log.error("JMAP request failed", {
        status: response.status,
        apiUrl: session.apiUrl,
        methods: methodCalls.map(([method]) => method),
        detail,
        retriedAfterUnauthorized: !allowRetry,
      });

      if (response.status === 401) {
        await this.onUnauthorized?.();
        throw new JmapHttpStatusError(
          response.status, "Mail sign-in expired or was rejected by the mail server.",
        );
      }

      throw new JmapHttpStatusError(
        response.status, formatHttpStatusError("JMAP request", response.status, detail),
      );
    }

    const envelope = await response.json();
    if (!isJmapEnvelopeRecord(envelope)) {
      throw new Error("JMAP response was not readable.");
    }

    return envelope;
  }

  /** Soft-read a get list item; missing/errored methods return null. */
  private tryGetMethodListItem(
    envelope: JmapEnvelope,
    methodName: string,
  ): Record<string, unknown> | null {
    try {
      const result = this.getMethodResult<{
        list?: Array<Record<string, unknown>>;
      }>(envelope, methodName);
      return result.list?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
