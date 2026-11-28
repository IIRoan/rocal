import { JmapMailClient, type JmapEnvelope } from "@workspace/calendar-client/jmap-mail-client";
import type {
  JmapEmailMessage,
  JmapEmailPlacement,
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
  type SentJmapMessage,
  chunkArray,
  resolveMailboxMessagesPageSize,
  chunkJmapMethodCalls,
  jmapMethodCallsHaveDependencies,
  extractTextQueryFromJmapFilter,
  buildEmailRestoreMailboxesMethodCall,
  type MailMailboxRestore,
  parseJmapBlobUploadResponse,
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

const log = createLogger("native-mail-jmap");

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function isJmapSession(value: unknown): value is JmapSession {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.apiUrl === "string" &&
    typeof record.accounts === "object" &&
    record.accounts !== null &&
    typeof record.primaryAccounts === "object" &&
    record.primaryAccounts !== null
  );
}

function isJmapEnvelope(value: unknown): value is JmapEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const { methodResponses } = value as { methodResponses?: unknown };
  return methodResponses === undefined || Array.isArray(methodResponses);
}

/** JMAP error bodies carry `{ message }`; anything else is ignored. */
function errorMessageFromBody(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const { message } = value as { message?: unknown };
  return typeof message === "string" ? message : null;
}

type JmapClientBearerAuthInput = {
  baseUrl: string;
  accessToken?: string;
  getAccessToken?: (() => Promise<string> | string) | undefined;
  fetcher?: Fetcher;
  getMailboxNameCipher?: () => Promise<MailboxNameCipher | null>;
};

function defaultFetcher(input: string, init?: RequestInit): Promise<Response> {
  // repo-rules-allow client-api-boundary: JMAP protocol transport to the mail server, not a Solace API route.
  return globalThis.fetch(input, init);
}

const EMAIL_LIST_GET_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "keywords",
  "receivedAt",
  "from",
  "to",
  "subject",
  "preview",
  "hasAttachment",
] as const;

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
  "size",
  "bodyStructure",
  "bodyValues",
  "textBody",
  "htmlBody",
  "attachments",
] as const;

const EMAIL_DETAIL_GET_PROPERTIES = [
  ...EMAIL_GET_PROPERTIES,
  ...SIMPLELOGIN_JMAP_PROPERTIES,
  LIST_UNSUBSCRIBE_POST_JMAP_PROPERTY,
  AUTH_RESULTS_JMAP_PROPERTY,
] as const;

/** Mailbox rows and thread grouping: metadata only, so the server never reads message blobs for them. */
const EMAIL_ROW_GET_PROPERTIES = [
  ...EMAIL_GET_PROPERTIES.filter((property) => property !== "bodyValues"),
  "preview",
] as const;

type EmailGetView = "detail" | "row" | "index";

const EMAIL_GET_VIEW_PROPERTIES: Record<EmailGetView, readonly string[]> = {
  detail: EMAIL_DETAIL_GET_PROPERTIES,
  row: EMAIL_ROW_GET_PROPERTIES,
  index: EMAIL_LIST_GET_PROPERTIES,
};

export class StalwartJmapClient extends JmapMailClient {
  private readonly baseUrl: string;
  private readonly accessTokenProvider?: () => Promise<string> | string;
  private readonly fetcher: Fetcher;

  constructor({
    baseUrl,
    fetcher = defaultFetcher,
    getMailboxNameCipher: mailboxNameCipher = getMailboxNameCipher,
    ...auth
  }: JmapClientBearerAuthInput) {
    super(mailboxNameCipher, log);
    this.baseUrl = trimTrailingSlashes(baseUrl);

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
      ? resolveMailboxMessagesPageSize(this.mailServerPolicy, 30)
      : 20;
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
        const detailMessage = errorMessageFromBody(await response.json());
        if (detailMessage) detail = ` — ${detailMessage}`;
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

    const sessionPayload: unknown = await response.json();
    if (!isJmapSession(sessionPayload)) {
      throw new Error("Mail server returned an invalid JMAP session.");
    }

    return normalizeJmapSession(sessionPayload, this.baseUrl);
  }

  async uploadBlob(
    session: JmapSession,
    bytes: Uint8Array,
    contentType: string,
    isCurrent?: () => boolean,
  ): Promise<JmapAttachmentInput> {
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
        "Content-Type": contentType || "application/octet-stream",
      },
      // Our bytes never sit on a SharedArrayBuffer, and expo/fetch reads the view in place instead of copying it.
      body: bytes as Uint8Array<ArrayBuffer>,
    });
    assertMailSendCurrent({ isCurrent });
    if (!response.ok) {
      throw new Error(`Blob upload failed with status ${response.status}.`);
    }
    const json: unknown = await response.json();
    assertMailSendCurrent({ isCurrent });
    const parsed = parseJmapBlobUploadResponse(
      json,
      bytes.byteLength,
      "Blob upload",
    );
    return {
      blobId: parsed.blobId,
      name: "attachment",
      type: parsed.type || contentType || "application/octet-stream",
      size: parsed.size,
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
      { properties: EMAIL_ROW_GET_PROPERTIES },
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
      { filter: { inMailbox: mailboxId, text: query }, limit, position: 0 },
      { properties: EMAIL_GET_PROPERTIES, includeBodies: true },
      query,
    );
  }

  /** Field search (from/to/subject/body/dates/keywords) with a FilterCondition from `buildJmapFilter`. */
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
      { properties: EMAIL_GET_PROPERTIES, includeBodies: true },
      extractTextQueryFromJmapFilter(filter),
    );
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
      view: "index",
    });
    return { messages, total, queryState };
  }

  async getMessagesByIds(
    session: JmapSession,
    ids: string[],
    options: { view?: EmailGetView } = {},
  ): Promise<JmapEmailMessage[]> {
    if (ids.length === 0) {
      return [];
    }

    const view = options.view ?? "detail";
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
                properties: [...EMAIL_GET_VIEW_PROPERTIES[view]],
                ...(view === "detail"
                  ? {
                      fetchTextBodyValues: true,
                      fetchHTMLBodyValues: true,
                      fetchAllBodyValues: true,
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

  /** Only the fields other devices change when they move, delete, read or flag mail. */
  async getEmailPlacements(
    session: JmapSession,
    ids: string[],
  ): Promise<{ list: JmapEmailPlacement[]; notFound: string[] }> {
    if (ids.length === 0) {
      return { list: [], notFound: [] };
    }

    const accountId = this.requirePrimaryAccountId(session);
    const results = await Promise.all(
      chunkArray(ids, this.getEmailGetChunkSize()).map(async (chunk) => {
        const envelope = await this.call(
          session,
          ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          [
            [
              "Email/get",
              {
                accountId,
                ids: chunk,
                properties: ["id", "mailboxIds", "keywords"],
              },
              "c1",
            ],
          ],
        );
        return this.getMethodResult<{
          list?: JmapEmailPlacement[];
          notFound?: string[];
        }>(envelope, "Email/get");
      }),
    );

    return {
      list: results.flatMap((result) => result.list ?? []),
      notFound: results.flatMap((result) => result.notFound ?? []),
    };
  }

  async getThreadMessages(
    session: JmapSession,
    threadId: string,
  ): Promise<JmapEmailMessage[]> {
    const emailIds = await this.getThreadMessageIds(session, threadId);
    return this.getMessagesByIds(session, emailIds, { view: "row" });
  }

  /** Loads several threads in two round trips instead of two per thread. */
  async getThreadsMessages(
    session: JmapSession,
    threadIds: string[],
  ): Promise<Map<string, JmapEmailMessage[]>> {
    const byThread = new Map<string, JmapEmailMessage[]>();
    if (threadIds.length === 0) {
      return byThread;
    }
    const accountId = this.requirePrimaryAccountId(session);
    const threadEnvelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Thread/get", { accountId, ids: threadIds }, "c1"]],
    );
    const threads =
      this.getMethodResult<{
        list?: { id: string; emailIds?: string[] }[];
      }>(threadEnvelope, "Thread/get").list ?? [];
    const messages = await this.getMessagesByIds(
      session,
      threads.flatMap((thread) => thread.emailIds ?? []),
      { view: "row" },
    );
    const byId = new Map(messages.map((message) => [message.id, message]));
    for (const thread of threads) {
      byThread.set(
        thread.id,
        (thread.emailIds ?? []).flatMap((id) => {
          const message = byId.get(id);
          return message ? [message] : [];
        }),
      );
    }
    return byThread;
  }

  async getEmailState(session: JmapSession): Promise<string> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/get", { accountId, ids: [], properties: ["id"] }, "c1"]],
    );
    const result = this.getMethodResult<{ state?: string }>(
      envelope,
      "Email/get",
    );
    if (!result.state) {
      throw new Error("JMAP Email/get did not return a state.");
    }
    return result.state;
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

      const mailAccountId = this.requirePrimaryAccountId(session);
      return sendJmapMessage(guardedInput, {
        attempt,
        mailAccountId,
        submissionAccountId: getSubmissionAccountId(session, mailAccountId),
        policy: this.mailServerPolicy,
        request: (using, calls) => this.call(session, using, calls, guardedInput.isCurrent),
        uploadMessage: (wire) =>
          this.uploadBlob(
            session,
            new TextEncoder().encode(wire),
            "message/rfc822",
            guardedInput.isCurrent,
          ),
        onCleanupError: (error) => {
          log.warn("Sent mail cleanup failed", sanitizeContext({ error }));
        },
      });
    });
  }

  deleteMessage(session: JmapSession, messageId: string): Promise<void> {
    return this.bulkDestroyMessages(session, [messageId]);
  }

  /** Undo for a move: restores each message's previous mailbox membership. */
  async restoreMessageMailboxes(
    session: JmapSession,
    restores: MailMailboxRestore[],
  ): Promise<void> {
    if (restores.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    await this.applyEmailSet(session, buildEmailRestoreMailboxesMethodCall(accountId, restores), "Restore messages");
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

  protected async call(
    session: JmapSession,
    capabilities: string[],
    methodCalls: JmapMethodCall[],
    isCurrent?: () => boolean,
  ): Promise<JmapEnvelope> {
    const maxMethodCalls = this.getMaxMethodCalls();
    if (
      methodCalls.length <= maxMethodCalls ||
      jmapMethodCallsHaveDependencies(methodCalls)
    ) {
      return this.executeCall(session, capabilities, methodCalls, isCurrent);
    }

    // Chunks only run when no call references another's result, so the requests are independent.
    const envelopes = await Promise.all(
      chunkJmapMethodCalls(methodCalls, maxMethodCalls).map((chunk) =>
        this.executeCall(session, capabilities, chunk, isCurrent),
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

    assertMailSendCurrent({ isCurrent });
    if (!response.ok) {
      let responseBody = "";
      try {
        responseBody = await response.text();
      } catch {
        responseBody = "";
      }

      const detail = responseBody ? ` — ${responseBody.slice(0, 500)}` : "";
      throw new JmapHttpStatusError(
        response.status, `JMAP request failed with status ${response.status}${detail}.`,
      );
    }

    const envelopePayload: unknown = await response.json();
    if (!isJmapEnvelope(envelopePayload)) {
      throw new Error("JMAP response envelope was not an object.");
    }

    return envelopePayload;
  }
}
