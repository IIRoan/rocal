/**
 * JMAP client for Stalwart (native). Same as web `lib/mail/jmap-client.ts`; bearer token from oauth-token-manager.
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
  parseSendMessageResults,
  chunkArray,
  resolveMailServerPolicy,
  resolveMailboxMessagesPageSize,
  resolveMailboxSearchPageSize,
  STALWART_EMAIL_POLICY_PROPERTIES,
  STALWART_JMAP_POLICY_PROPERTIES,
  DEFAULT_JMAP_MAX_METHOD_CALLS,
  chunkJmapMethodCalls,
  estimateOutgoingJmapMessageBytes,
  jmapMethodCallsHaveDependencies,
  validateOutgoingMessageSize,
  validateJmapRequestSize,
  isStalwartEncryptOnAppendEnabled,
  sortMailMessagesBySearchRelevance,
  parseJmapBlobUploadResponse,
  type MailServerPolicy,
  type MailServerPolicyConfig,
} from "@workspace/calendar-core";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
const MAIL_SERVER_POLICY_REFRESH_TTL_MS = 60_000;

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
  disposition?: "attachment" | "inline";
  cid?: string;
};

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
  "bodyStructure",
  "bodyValues",
  "textBody",
  "htmlBody",
  "attachments",
] as const;

const EMAIL_DETAIL_GET_PROPERTIES = [
  ...EMAIL_GET_PROPERTIES,
  "header:Authentication-Results",
] as const;

export type JmapPgpMimeCiphertext = {
  blobId: string;
  size: number;
};

function buildPgpMimeBodyStructure(
  ciphertext: JmapPgpMimeCiphertext,
): Record<string, unknown> {
  return {
    type: "multipart/encrypted",
    subParts: [
      { type: "application/pgp-encrypted", partId: "pgp-version" },
      {
        type: "application/octet-stream",
        blobId: ciphertext.blobId,
        size: ciphertext.size,
      },
    ],
  };
}

/** JMAP Email/set body fields — matches Bulwark/webmail sendEmail (convenience properties). */
function buildEmailContentFields(input: {
  textBody: string;
  htmlBody?: string;
  attachments?: JmapAttachmentInput[];
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
}): Record<string, unknown> {
  if (input.pgpMimeCiphertext) {
    return {
      bodyStructure: buildPgpMimeBodyStructure(input.pgpMimeCiphertext),
      bodyValues: buildMessageBodyValues(input),
    };
  }

  const trimmedHtml = input.htmlBody?.trim();
  const fields: Record<string, unknown> = {
    bodyValues: trimmedHtml
      ? {
          text: { value: normalizeJmapBodyValue(input.textBody) },
          html: { value: normalizeJmapBodyValue(trimmedHtml) },
        }
      : {
          text: { value: normalizeJmapBodyValue(input.textBody) },
        },
    textBody: [{ partId: "text", type: "text/plain" }],
  };

  if (trimmedHtml) {
    fields.htmlBody = [{ partId: "html", type: "text/html" }];
  }

  if (input.attachments?.length) {
    fields.attachments = input.attachments.map((attachment) => ({
      blobId: attachment.blobId,
      type: attachment.type,
      name: attachment.name,
      disposition: attachment.disposition ?? "attachment",
      ...(attachment.cid ? { cid: attachment.cid } : {}),
    }));
  }

  return fields;
}

function normalizeJmapBodyValue(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

function buildMessageBodyValues(input: {
  textBody: string;
  htmlBody?: string;
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
}): Record<string, { value: string }> {
  if (input.pgpMimeCiphertext) {
    return {
      "pgp-version": { value: "Version: 1\r\n" },
    };
  }

  if (input.htmlBody) {
    return {
      text: { value: normalizeJmapBodyValue(input.textBody) },
      html: { value: normalizeJmapBodyValue(input.htmlBody) },
    };
  }
  return { text: { value: normalizeJmapBodyValue(input.textBody) } };
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
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
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
        ...buildEmailContentFields(input),
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
        ...buildEmailContentFields(input),
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
  private mailServerPolicy: MailServerPolicy | null = null;
  private mailServerPolicyConfig: Partial<MailServerPolicyConfig> | null = null;
  private mailServerPolicyFetchedAtMs = 0;
  private mailServerPolicyInflight: Promise<MailServerPolicy | null> | null =
    null;

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

  setMailServerPolicy(
    policy: MailServerPolicy | null,
    configPolicy: Partial<MailServerPolicyConfig> | null = null,
  ): void {
    this.mailServerPolicy = policy;
    this.mailServerPolicyConfig = configPolicy;
    this.mailServerPolicyFetchedAtMs = policy ? Date.now() : 0;
  }

  async syncMailServerPolicy(
    session: JmapSession,
    options?: { force?: boolean },
  ): Promise<MailServerPolicy | null> {
    const shouldRefresh =
      options?.force === true ||
      !this.mailServerPolicy ||
      Date.now() - this.mailServerPolicyFetchedAtMs >=
        MAIL_SERVER_POLICY_REFRESH_TTL_MS;

    if (!shouldRefresh) {
      return this.mailServerPolicy;
    }

    if (this.mailServerPolicyInflight) {
      return this.mailServerPolicyInflight;
    }

    const inflight = this.getStalwartPolicySingletons(session)
      .then((stalwartPolicy) => {
        const nextPolicy = resolveMailServerPolicy({
          session,
          emailSettings: stalwartPolicy.emailSettings,
          jmapSettings: stalwartPolicy.jmapSettings,
          configPolicy: this.mailServerPolicyConfig,
        });
        this.setMailServerPolicy(nextPolicy, this.mailServerPolicyConfig);
        return nextPolicy;
      })
      .finally(() => {
        if (this.mailServerPolicyInflight === inflight) {
          this.mailServerPolicyInflight = null;
        }
      });

    this.mailServerPolicyInflight = inflight;
    return inflight;
  }

  private getEmailGetChunkSize(): number {
    return this.mailServerPolicy?.getMaxResults ?? 500;
  }

  private getDefaultMailboxPageSize(): number {
    return this.mailServerPolicy
      ? resolveMailboxMessagesPageSize(this.mailServerPolicy, 30)
      : 20;
  }

  private getDefaultSearchPageSize(): number {
    return this.mailServerPolicy
      ? resolveMailboxSearchPageSize(this.mailServerPolicy, 40)
      : 40;
  }

  private getMaxMethodCalls(): number {
    return this.mailServerPolicy?.maxMethodCalls ?? DEFAULT_JMAP_MAX_METHOD_CALLS;
  }

  private validateOutgoingMessagePolicy(input: {
    subject: string;
    textBody: string;
    htmlBody?: string;
    attachments?: JmapAttachmentInput[];
    enforceRequestLimit?: boolean;
  }): string | null {
    const estimatedBytes = estimateOutgoingJmapMessageBytes({
      subject: input.subject,
      textBody: input.textBody,
      htmlBody: input.htmlBody,
      attachments: input.attachments,
    });
    const messageError = validateOutgoingMessageSize(
      estimatedBytes,
      this.mailServerPolicy?.limits.maxMessageSizeBytes,
    );
    if (messageError) {
      return messageError;
    }
    if (input.enforceRequestLimit !== false && this.mailServerPolicy) {
      return validateJmapRequestSize(estimatedBytes, this.mailServerPolicy);
    }
    return null;
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

  /**
   * Stalwart encryptOnAppend re-encrypts JMAP submissions with the user's PGP
   * key, which breaks external delivery. Solace handles internal encryption.
   */
  async ensureEncryptOnAppendDisabled(session: JmapSession): Promise<void> {
    const settings = await this.getAccountSettings(session);
    if (!isStalwartEncryptOnAppendEnabled(settings)) {
      return;
    }

    const encryptionAtRest = settings.encryptionAtRest;
    if (!encryptionAtRest || typeof encryptionAtRest !== "object") {
      return;
    }

    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      [
        [
          "x:AccountSettings/set",
          {
            accountId,
            update: {
              singleton: {
                encryptionAtRest: {
                  ...(encryptionAtRest as Record<string, unknown>),
                  encryptOnAppend: false,
                },
              },
            },
          },
          "c1",
        ],
      ],
    );
    const result = this.getMethodResult<{
      notUpdated?: Record<string, { description?: string }>;
    }>(envelope, "x:AccountSettings/set");
    const updateError = result.notUpdated?.singleton;
    if (updateError) {
      throw new Error(
        updateError.description ?? "Failed to disable Stalwart encryptOnAppend.",
      );
    }
  }

  async getStalwartPolicySingletons(
    session: JmapSession,
  ): Promise<{
    emailSettings: Record<string, unknown> | null;
    jmapSettings: Record<string, unknown> | null;
  }> {
    try {
      const envelope = await this.call(
        session,
        ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
        [
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
        ],
      );
      const emailResult = this.getMethodResult<{
        list?: Record<string, unknown>[];
      }>(envelope, "x:Email/get");
      const jmapResult = this.getMethodResult<{
        list?: Record<string, unknown>[];
      }>(envelope, "x:Jmap/get");
      return {
        emailSettings: emailResult.list?.[0] ?? null,
        jmapSettings: jmapResult.list?.[0] ?? null,
      };
    } catch {
      return { emailSettings: null, jmapSettings: null };
    }
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

  async createMailbox(
    session: JmapSession,
    name: string,
    role?: string | null,
  ): Promise<JmapMailbox> {
    const accountId = this.requirePrimaryAccountId(session);
    const createPayload: Record<string, unknown> = { name };
    if (role) {
      createPayload.role = role;
    }
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Mailbox/set", { accountId, create: { new: createPayload } }, "c1"]],
    );
    const result = this.getMethodResult<{
      created?: Record<string, JmapMailbox>;
    }>(envelope, "Mailbox/set");
    const created = result.created?.new;
    if (!created) {
      throw new Error("Mailbox was not created.");
    }
    return { ...created, name, role: role ?? created.role ?? null };
  }

  async renameMailbox(
    session: JmapSession,
    mailboxId: string,
    name: string,
  ): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Mailbox/set", { accountId, update: { [mailboxId]: { name } } }, "c1"]],
    );
  }

  async deleteMailbox(session: JmapSession, mailboxId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Mailbox/set", { accountId, destroy: [mailboxId] }, "c1"]],
    );
  }

  async updateMailboxSortOrders(
    session: JmapSession,
    updates: { id: string; sortOrder: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    const update = Object.fromEntries(
      updates.map(({ id, sortOrder }) => [id, { sortOrder }]),
    );
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Mailbox/set", { accountId, update }, "c1"]],
    );
  }

  async uploadBlob(
    session: JmapSession,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<JmapAttachmentInput> {
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.uploadUrl) {
      throw new Error("No upload URL in JMAP session.");
    }
    const url = session.uploadUrl.replace(
      "{accountId}",
      encodeURIComponent(accountId),
    );
    const authorization = await this.getAuthorizationHeader();
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": contentType || "application/octet-stream",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Blob upload failed with status ${response.status}.`);
    }
    const json: unknown = await response.json();
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
    const { limit = this.getDefaultMailboxPageSize(), position = 0 } = options;
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
    limit = this.getDefaultSearchPageSize(),
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
    const messages = result.list ?? [];
    return {
      messages: sortMailMessagesBySearchRelevance(messages, query),
      total: queryResult.total ?? 0,
    };
  }

  async getMailboxMessageIds(
    session: JmapSession,
    mailboxId: string,
    options: { limit?: number; position?: number } = {},
  ): Promise<{ ids: string[]; total: number; queryState?: string }> {
    const { limit = this.getDefaultMailboxPageSize(), position = 0 } = options;
    const accountId = this.requirePrimaryAccountId(session);
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
            position,
          },
          "q1",
        ],
      ],
    );
    const result = this.getMethodResult<{
      ids?: string[];
      total?: number;
      queryState?: string;
    }>(envelope, "Email/query");

    return {
      ids: result.ids ?? [],
      total: result.total ?? 0,
      queryState: result.queryState,
    };
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
      includeBodies: false,
    });
    return { messages, total, queryState };
  }

  async getMessagesByIds(
    session: JmapSession,
    ids: string[],
    options: { includeBodies?: boolean } = {},
  ): Promise<JmapEmailMessage[]> {
    if (ids.length === 0) {
      return [];
    }

    const includeBodies = options.includeBodies ?? true;
    const accountId = this.requirePrimaryAccountId(session);
    const chunkSize = this.getEmailGetChunkSize();
    const chunks = chunkArray(ids, chunkSize);
    const messages: JmapEmailMessage[] = [];

    for (const chunk of chunks) {
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
                  ? EMAIL_DETAIL_GET_PROPERTIES
                  : EMAIL_LIST_GET_PROPERTIES),
              ],
              ...(includeBodies
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
      const result = this.getMethodResult<{ list?: JmapEmailMessage[] }>(
        envelope,
        "Email/get",
      );
      messages.push(...(result.list ?? []));
    }

    return messages;
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
  ): Promise<{
    emailId: string;
    threadId: string | null;
    submissionId: string;
  }> {
    await this.syncMailServerPolicy(session);

    const sizeError = this.validateOutgoingMessagePolicy(input);
    if (sizeError) {
      throw new Error(sizeError);
    }

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
    return parseSendMessageResults({
      emailSet: this.getMethodResult(envelope, "Email/set"),
      emailSubmissionSet: this.getMethodResult(envelope, "EmailSubmission/set"),
    });
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
    await this.syncMailServerPolicy(session);

    const sizeError = this.validateOutgoingMessagePolicy(input);
    if (sizeError) {
      throw new Error(sizeError);
    }

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
    const maxMethodCalls = this.getMaxMethodCalls();
    if (
      methodCalls.length <= maxMethodCalls ||
      jmapMethodCallsHaveDependencies(methodCalls)
    ) {
      return this.executeCall(session, using, methodCalls);
    }

    const merged: JmapEnvelope = { methodResponses: [] };
    for (const chunk of chunkJmapMethodCalls(methodCalls, maxMethodCalls)) {
      const envelope = await this.executeCall(session, using, chunk);
      merged.methodResponses!.push(...(envelope.methodResponses ?? []));
    }
    return merged;
  }

  private async executeCall(
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
