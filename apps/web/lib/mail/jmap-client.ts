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
  parseJmapBlobUploadResponse,
  parseSendMessageResults,
  validateUploadedBlob,
  type PreparedOutgoingAttachment,
  chunkArray,
  runTasksWithConcurrencyLimit,
  resolveMailServerPolicy,
  resolveMailboxMessagesPageSize,
  resolveMailboxSearchPageSize,
  STALWART_EMAIL_POLICY_PROPERTIES,
  STALWART_JMAP_POLICY_PROPERTIES,
  DEFAULT_JMAP_MAX_METHOD_CALLS,
  DEFAULT_JMAP_UPLOAD_TTL_MS,
  MailBlobUploadRegistry,
  chunkJmapMethodCalls,
  estimateOutgoingJmapMessageBytes,
  isBlobUploadExpired,
  jmapMethodCallsHaveDependencies,
  validateOutgoingMessageSize,
  validateJmapRequestSize,
  isStalwartEncryptOnAppendEnabled,
  type MailServerPolicy,
  type MailServerPolicyConfig,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";

const log = createLogger("mail-jmap");
const MAIL_SERVER_POLICY_REFRESH_TTL_MS = 60_000;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type JmapMethodCall = [string, Record<string, unknown>, string];

type JmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
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
  onUnauthorized?: () => void | Promise<void>;
  fetcher?: Fetcher;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function defaultFetcher(input: string, init?: RequestInit): Promise<Response> {
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
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const parts = [
        typeof parsed.message === "string" ? parsed.message : null,
        typeof parsed.title === "string" ? parsed.title : null,
        typeof parsed.detail === "string" ? parsed.detail : null,
        typeof parsed.error === "string" ? parsed.error : null,
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

function base64Encode(value: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }

  return Buffer.from(value, "utf8").toString("base64");
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
  "size",
  "receivedAt",
  "from",
  "to",
  "subject",
  "preview",
  "hasAttachment",
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
  "header:Authentication-Results",
  "header:Received",
  "header:DKIM-Signature",
] as const;

export type GetMessagesOptions = {
  /** When false, only list-preview metadata is fetched (no MIME/blob work). Default true. */
  includeBodies?: boolean;
};

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
  private readonly onUnauthorized?: () => void | Promise<void>;
  private readonly fetcher: Fetcher;
  private mailServerPolicy: MailServerPolicy | null = null;
  private mailServerPolicyConfig: Partial<MailServerPolicyConfig> | null = null;
  private mailServerPolicyFetchedAtMs = 0;
  private mailServerPolicyInflight: Promise<MailServerPolicy | null> | null =
    null;
  private readonly blobUploadRegistry = new MailBlobUploadRegistry();

  constructor({
    baseUrl,
    fetcher = defaultFetcher,
    onUnauthorized,
    ...auth
  }: JmapClientBearerAuthInput) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
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
      ? resolveMailboxMessagesPageSize(this.mailServerPolicy, 25)
      : 25;
  }

  private getDefaultSearchPageSize(): number {
    return this.mailServerPolicy
      ? resolveMailboxSearchPageSize(this.mailServerPolicy, 40)
      : 40;
  }

  private getUploadTtlMs(): number {
    return this.mailServerPolicy?.uploadTtlMs ?? DEFAULT_JMAP_UPLOAD_TTL_MS;
  }

  private getMaxMethodCalls(): number {
    return this.mailServerPolicy?.maxMethodCalls ?? DEFAULT_JMAP_MAX_METHOD_CALLS;
  }

  private validateOutgoingMessagePolicy(input: {
    subject: string;
    textBody: string;
    htmlBody?: string;
    attachments?: JmapAttachmentInput[];
    pgpMimeCiphertext?: JmapPgpMimeCiphertext;
    enforceRequestLimit?: boolean;
  }): string | null {
    const estimatedBytes = estimateOutgoingJmapMessageBytes({
      subject: input.subject,
      textBody: input.textBody,
      htmlBody: input.htmlBody,
      attachments: input.attachments,
      pgpMimeCiphertext: input.pgpMimeCiphertext,
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

  private async refreshRegisteredBlobUploads(session: JmapSession): Promise<void> {
    const uploadTtlMs = this.getUploadTtlMs();
    const now = Date.now();

    for (const record of this.blobUploadRegistry.listRegistered()) {
      if (!isBlobUploadExpired(record.uploadedAt, uploadTtlMs, now)) {
        continue;
      }

      const refreshed =
        record.source.kind === "text"
          ? await this.uploadBlob(
              session,
              new Blob([record.source.text], {
                type: record.source.contentType ?? "application/octet-stream",
              }),
              record.source.contentType ?? "application/octet-stream",
            )
          : await this.uploadBlob(
              session,
              new Blob([record.source.content.slice()], {
                type: record.source.contentType,
              }),
              record.source.contentType,
            );

      this.blobUploadRegistry.replaceBlobId(record.blobId, {
        blobId: refreshed.blobId,
        size: refreshed.size,
        uploadedAt: Date.now(),
      });
    }
  }

  private async refreshOutgoingBlobReferences(
    session: JmapSession,
    input: {
      attachments?: JmapAttachmentInput[];
      pgpMimeCiphertext?: JmapPgpMimeCiphertext;
    },
  ): Promise<{
    attachments?: JmapAttachmentInput[];
    pgpMimeCiphertext?: JmapPgpMimeCiphertext;
  }> {
    if (
      !input.attachments?.length &&
      !input.pgpMimeCiphertext
    ) {
      return input;
    }

    await this.refreshRegisteredBlobUploads(session);

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
    return this.discoverSessionWithRetry(true);
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
      await this.onUnauthorized?.();
      return this.discoverSessionWithRetry(false);
    }

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
      list?: Array<Record<string, unknown>>;
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
      log.warn("Failed to disable Stalwart encryptOnAppend", {
        description: updateError.description,
      });
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
        list?: Array<Record<string, unknown>>;
      }>(envelope, "x:Email/get");
      const jmapResult = this.getMethodResult<{
        list?: Array<Record<string, unknown>>;
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

  async searchMailboxMessagesWithFilter(
    session: JmapSession,
    mailboxId: string,
    filter: Record<string, unknown>,
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
            filter:
              filter.inMailbox || filter.operator
                ? filter
                : { inMailbox: mailboxId, ...filter },
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

  async getThreadMessageIds(
    session: JmapSession,
    threadId: string,
  ): Promise<string[]> {
    const accountId = this.requirePrimaryAccountId(session);
    const envelope = await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [
        [
          "Thread/get",
          {
            accountId,
            ids: [threadId],
          },
          "t1",
        ],
      ],
    );
    const result = this.getMethodResult<{ list?: { emailIds?: string[] }[] }>(
      envelope,
      "Thread/get",
    );
    return result.list?.[0]?.emailIds ?? [];
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
                { operator: "OR", conditions: threadIds.map((tid) => ({ threadId: tid })) },
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
  ): Promise<{ messages: JmapEmailMessage[]; total: number; queryState?: string }> {
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
      list?: Array<{ id: string; emailIds?: string[] }>;
    }>(threadEnvelope, "Thread/get");
    const emailIds = threadResult.list?.[0]?.emailIds ?? [];
    return this.getMessagesByIds(session, emailIds, { includeBodies: false });
  }

  async uploadFile(session: JmapSession, file: File): Promise<JmapAttachmentInput> {
    const uploaded = await this.uploadBlob(
      session,
      file,
      file.type || "application/octet-stream",
    );
    return {
      blobId: uploaded.blobId,
      name: file.name,
      type: uploaded.type,
      size: uploaded.size,
    };
  }

  async uploadBlob(
    session: JmapSession,
    blob: Blob,
    contentType: string,
    allowRetry = true,
  ): Promise<{ blobId: string; size: number; type: string }> {
    const accountId = this.requirePrimaryAccountId(session);
    if (!session.uploadUrl) {
      throw new Error("No upload URL in JMAP session.");
    }
    const url = session.uploadUrl.replace(
      "{accountId}",
      encodeURIComponent(accountId),
    );
    const authorization = await this.getAuthorizationHeader();
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": contentType,
      },
      body: blob,
    });

    if (response.status === 401 && allowRetry) {
      log.warn("Blob upload rejected with 401; clearing auth and retrying once", {
        url,
        contentType,
        blobSize: blob.size,
      });
      await this.onUnauthorized?.();
      return this.uploadBlob(session, blob, contentType, false);
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
      throw new Error(formatHttpStatusError("Blob upload", response.status, detail));
    }
    const json = await response.json();
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
  ): Promise<JmapAttachmentInput> {
    const blob = new Blob([attachment.content.slice()], {
      type: attachment.contentType,
    });
    const uploaded = await this.uploadBlob(
      session,
      blob,
      attachment.contentType,
    );
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
        (attachment) => () => this.uploadPreparedAttachment(session, attachment),
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
      pgpMimeCiphertext?: JmapPgpMimeCiphertext;
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

    const refreshed = await this.refreshOutgoingBlobReferences(session, input);
    const outgoing = { ...input, ...refreshed };
    const sizeError = this.validateOutgoingMessagePolicy(outgoing);
    if (sizeError) {
      throw new Error(sizeError);
    }

    const mailAccountId = this.requirePrimaryAccountId(session);
    const submissionAccountId = getSubmissionAccountId(session, mailAccountId);
    const calls = buildSendMessageMethodCalls(outgoing).map(
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

    const refreshed = await this.refreshOutgoingBlobReferences(session, input);
    const outgoing = { ...input, ...refreshed };
    const sizeError = this.validateOutgoingMessagePolicy(outgoing);
    if (sizeError) {
      throw new Error(sizeError);
    }

    const accountId = this.requirePrimaryAccountId(session);
    const calls = buildDraftMethodCalls(outgoing).map(([method, params, id]) => [
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
    if (!created) throw new Error("Mailbox was not created.");
    return { ...created, name, role: role ?? created.role ?? null };
  }

  async deleteMailbox(session: JmapSession, mailboxId: string): Promise<void> {
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Mailbox/set", { accountId, destroy: [mailboxId] }, "c1"]],
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

  async bulkMoveToTrash(
    session: JmapSession,
    messageIds: string[],
    trashMailboxId: string | null,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    if (trashMailboxId) {
      const update = Object.fromEntries(
        messageIds.map((id) => [
          id,
          { mailboxIds: { [trashMailboxId]: true } },
        ]),
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

  async bulkDestroyMessages(
    session: JmapSession,
    messageIds: string[],
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const accountId = this.requirePrimaryAccountId(session);
    await this.call(
      session,
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      [["Email/set", { accountId, destroy: messageIds }, "c1"]],
    );
  }

  /** Permanently delete every message in a mailbox (trash / junk empty). */
  async emptyMailbox(session: JmapSession, mailboxId: string): Promise<number> {
    const batchSize = 100;
    let destroyed = 0;

    while (true) {
      const { ids } = await this.getMailboxMessageIds(session, mailboxId, {
        limit: batchSize,
        position: 0,
      });
      if (ids.length === 0) break;
      await this.bulkDestroyMessages(session, ids);
      destroyed += ids.length;
      if (ids.length < batchSize) break;
    }

    return destroyed;
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
      throw new Error(formatHttpStatusError("Blob download", response.status, detail));
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
      throw new Error(formatHttpStatusError("Blob download", response.status, detail));
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
      log.warn("Blob download rejected with 401; clearing auth and retrying once", {
        url,
      });
      await this.onUnauthorized?.();
      return this.authorizedBlobFetch(url, false);
    }

    return response;
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
    allowRetry = true,
  ): Promise<JmapEnvelope> {
    const maxMethodCalls = this.getMaxMethodCalls();
    if (
      methodCalls.length <= maxMethodCalls ||
      jmapMethodCallsHaveDependencies(methodCalls)
    ) {
      return this.executeCall(session, using, methodCalls, allowRetry);
    }

    const merged: JmapEnvelope = { methodResponses: [] };
    for (const chunk of chunkJmapMethodCalls(methodCalls, maxMethodCalls)) {
      const envelope = await this.executeCall(session, using, chunk, allowRetry);
      merged.methodResponses!.push(...(envelope.methodResponses ?? []));
    }
    return merged;
  }

  private async executeCall(
    session: JmapSession,
    using: string[],
    methodCalls: JmapMethodCall[],
    allowRetry = true,
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

    if (response.status === 401 && allowRetry) {
      log.warn("JMAP request rejected with 401; clearing auth and retrying once", {
        apiUrl: session.apiUrl,
        methods: methodCalls.map(([method]) => method),
      });
      await this.onUnauthorized?.();
      return this.executeCall(session, using, methodCalls, false);
    }

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
        throw new Error(
          "Mail sign-in expired or was rejected by the mail server.",
        );
      }

      throw new Error(
        formatHttpStatusError("JMAP request", response.status, detail),
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
