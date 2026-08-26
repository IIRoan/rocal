const DEFAULT_STALWART_JMAP_URL = "https://mail.solace.onl";
const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
] as const;
const REQUEST_TIMEOUT_MS = 15_000;

type JmapMethodCall = [string, Record<string, unknown>, string];

type JmapEnvelope = {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
};

type JmapMethodError = {
  type?: string;
  description?: string;
  properties?: string[];
};

type JmapSession = {
  apiUrl?: string;
  uploadUrl?: string;
  primaryAccounts?: Record<string, string>;
  accounts?: Record<string, unknown>;
};

export type JmapMailbox = {
  id: string;
  role?: string | null;
  name?: string;
};

export type JmapIdentity = {
  id: string;
  email?: string;
  name?: string | null;
};

export type StalwartJmapMailerConfig = {
  baseUrl: string;
  username: string;
  password: string;
  from: string;
  fromName: string;
};

export type TransactionalEmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: TransactionalEmailAttachment[];
};

export function isStalwartMailConfigured(input: {
  username?: string;
  password?: string;
  from?: string;
}): boolean {
  return Boolean(input.username && input.password && input.from);
}

export function jmapBaseUrl(url?: string): string {
  return (url || DEFAULT_STALWART_JMAP_URL).replace(/\/+$/, "");
}

export function pickMailbox(
  mailboxes: JmapMailbox[],
  role: "drafts" | "sent",
): JmapMailbox | null {
  const wanted = role.toLowerCase();
  return (
    mailboxes.find((mailbox) => mailbox.role?.toLowerCase() === wanted) ??
    mailboxes.find((mailbox) => mailbox.name?.toLowerCase() === wanted) ??
    null
  );
}

export function pickIdentity(
  identities: JmapIdentity[],
  fromEmail: string,
): JmapIdentity | null {
  const needle = fromEmail.trim().toLowerCase();
  return (
    identities.find(
      (identity) => identity.email?.trim().toLowerCase() === needle,
    ) ?? null
  );
}

export function rewriteToPublicOrigin(
  url: string | undefined,
  publicBase: string,
): string {
  const fallback = `${publicBase}/jmap/`;
  if (!url) {
    return fallback;
  }
  try {
    const parsed = new URL(url);
    const base = new URL(publicBase);
    parsed.protocol = base.protocol;
    parsed.hostname = base.hostname;
    parsed.port = base.port;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function formatJmapError(methodName: string, error: JmapMethodError): string {
  const typeHint = error.type ? ` [${error.type}]` : "";
  return `Failed during ${methodName}${typeHint}`;
}

function firstPatchError(
  patch: Record<string, JmapMethodError> | undefined,
): JmapMethodError | null {
  if (!patch) {
    return null;
  }
  return Object.values(patch)[0] ?? null;
}

function assertJmapSuccess(envelope: JmapEnvelope, context: string): void {
  const responses = envelope.methodResponses ?? [];
  if (responses.length === 0) {
    throw new Error(`${context}: empty JMAP response`);
  }

  for (const [methodName, result] of responses) {
    if (methodName === "error" || methodName.endsWith("/error")) {
      throw new Error(
        formatJmapError(methodName === "error" ? context : methodName, result),
      );
    }
    const patchError =
      firstPatchError(
        result.notCreated as Record<string, JmapMethodError> | undefined,
      ) ??
      firstPatchError(
        result.notUpdated as Record<string, JmapMethodError> | undefined,
      ) ??
      firstPatchError(
        result.notDestroyed as Record<string, JmapMethodError> | undefined,
      );
    if (patchError) {
      throw new Error(formatJmapError(methodName, patchError));
    }
  }
}

async function jmapFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  return fetcher(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function primaryAccountId(
  session: JmapSession,
  capability: string,
): string | undefined {
  return session.primaryAccounts?.[capability];
}

function methodResult<T>(envelope: JmapEnvelope, method: string): T {
  const match = envelope.methodResponses?.find((entry) => entry[0] === method);
  if (!match) {
    throw new Error(`Expected ${method} in JMAP response`);
  }
  return match[1] as T;
}

async function discoverSession(
  fetcher: typeof fetch,
  config: StalwartJmapMailerConfig,
  authorization: string,
): Promise<{
  apiUrl: string;
  uploadUrl: string;
  mailAccountId: string;
  submissionAccountId: string;
}> {
  const urls = [
    `${config.baseUrl}/jmap/session`,
    `${config.baseUrl}/.well-known/jmap`,
  ];
  let lastStatus = 0;

  for (const url of urls) {
    const response = await jmapFetch(fetcher, url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      redirect: "follow",
    });
    if (response.status === 401) {
      throw new Error("Stalwart JMAP authentication failed");
    }
    if (!response.ok) {
      lastStatus = response.status;
      continue;
    }
    const session = (await response.json()) as JmapSession;
    const mailAccountId =
      primaryAccountId(session, "urn:ietf:params:jmap:mail") ??
      primaryAccountId(session, "urn:stalwart:jmap") ??
      Object.keys(session.accounts ?? {})[0];
    if (!mailAccountId) {
      throw new Error("Stalwart JMAP session did not include a mail account");
    }
    return {
      apiUrl: rewriteToPublicOrigin(session.apiUrl, config.baseUrl),
      uploadUrl: rewriteToPublicOrigin(session.uploadUrl, config.baseUrl),
      mailAccountId,
      submissionAccountId:
        primaryAccountId(session, "urn:ietf:params:jmap:submission") ??
        mailAccountId,
    };
  }

  throw new Error(`Stalwart JMAP session failed (${String(lastStatus)})`);
}

async function jmapCall(
  fetcher: typeof fetch,
  apiUrl: string,
  authorization: string,
  methodCalls: JmapMethodCall[],
): Promise<JmapEnvelope> {
  const response = await jmapFetch(fetcher, apiUrl, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ using: [...JMAP_USING], methodCalls }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `Stalwart JMAP request failed (${String(response.status)})`,
    );
  }

  try {
    return JSON.parse(raw) as JmapEnvelope;
  } catch {
    throw new Error("Stalwart JMAP returned a non-JSON response");
  }
}

async function loadSendContext(
  fetcher: typeof fetch,
  apiUrl: string,
  authorization: string,
  mailAccountId: string,
  fromEmail: string,
): Promise<{ draftsId: string; sentId: string | null; identityId: string }> {
  const envelope = await jmapCall(fetcher, apiUrl, authorization, [
    [
      "Mailbox/get",
      {
        accountId: mailAccountId,
        ids: null,
        properties: ["id", "role", "name"],
      },
      "m",
    ],
    ["Identity/get", { accountId: mailAccountId }, "i"],
  ]);
  assertJmapSuccess(envelope, "Stalwart mailbox lookup");

  const mailboxes =
    methodResult<{ list?: JmapMailbox[] }>(envelope, "Mailbox/get").list ?? [];
  const identities =
    methodResult<{ list?: JmapIdentity[] }>(envelope, "Identity/get").list ?? [];
  const drafts = pickMailbox(mailboxes, "drafts");
  if (!drafts) {
    throw new Error("Stalwart mailbox has no Drafts folder");
  }
  const identity = pickIdentity(identities, fromEmail);
  if (!identity) {
    throw new Error(
      "Stalwart identity was not found; create it on the sending mailbox",
    );
  }

  return {
    draftsId: drafts.id,
    sentId: pickMailbox(mailboxes, "sent")?.id ?? null,
    identityId: identity.id,
  };
}

function resolveUploadUrl(template: string, accountId: string): string {
  return template.replaceAll("{accountId}", encodeURIComponent(accountId));
}

async function uploadAttachment(
  fetcher: typeof fetch,
  uploadUrl: string,
  authorization: string,
  accountId: string,
  attachment: TransactionalEmailAttachment,
): Promise<{ blobId: string; type: string; name: string; size: number }> {
  const type =
    attachment.contentType?.trim() || "application/octet-stream; charset=utf-8";
  const bytes = Buffer.from(attachment.content, "utf8");
  const response = await jmapFetch(
    fetcher,
    resolveUploadUrl(uploadUrl, accountId),
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": type.split(";")[0]?.trim() || "application/octet-stream",
      },
      body: bytes,
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `Stalwart blob upload failed (${String(response.status)})`,
    );
  }
  const parsed = JSON.parse(raw) as { blobId?: string; size?: number };
  if (!parsed.blobId) {
    throw new Error("Stalwart blob upload did not return a blobId");
  }
  return {
    blobId: parsed.blobId,
    type,
    name: attachment.filename,
    size: parsed.size ?? bytes.byteLength,
  };
}

function buildSendCalls(input: {
  mailAccountId: string;
  submissionAccountId: string;
  draftsId: string;
  sentId: string | null;
  identityId: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{
    blobId: string;
    type: string;
    name: string;
    size: number;
  }>;
}): JmapMethodCall[] {
  const submissionCreate: Record<string, unknown> = {
    emailId: "#draft1",
    identityId: input.identityId,
    envelope: {
      mailFrom: { email: input.from },
      rcptTo: [{ email: input.to }],
    },
  };

  const submission: Record<string, unknown> = {
    accountId: input.submissionAccountId,
    create: { s1: submissionCreate },
  };
  if (input.sentId) {
    submission.onSuccessUpdateEmail = {
      "#s1": {
        [`mailboxIds/${input.sentId}`]: true,
        [`mailboxIds/${input.draftsId}`]: null,
        "keywords/$draft": null,
      },
    };
  }

  const draft: Record<string, unknown> = {
    mailboxIds: { [input.draftsId]: true },
    keywords: { $seen: true, $draft: true },
    from: [{ name: input.fromName, email: input.from }],
    to: [{ email: input.to }],
    subject: input.subject,
    bodyValues: {
      text: { value: input.text },
      html: { value: input.html },
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: [{ partId: "html", type: "text/html" }],
  };

  if (input.attachments.length > 0) {
    draft.attachments = input.attachments.map((attachment) => ({
      blobId: attachment.blobId,
      type: attachment.type,
      name: attachment.name,
      size: attachment.size,
      disposition: "attachment",
    }));
  }

  return [
    [
      "Email/set",
      {
        accountId: input.mailAccountId,
        create: { draft1: draft },
      },
      "c1",
    ],
    ["EmailSubmission/set", submission, "c2"],
  ];
}

export async function sendTransactionalEmailViaStalwart(
  config: StalwartJmapMailerConfig,
  message: TransactionalEmail,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const authorization = basicAuthHeader(config.username, config.password);
  const session = await discoverSession(fetcher, config, authorization);
  const [context, attachments] = await Promise.all([
    loadSendContext(
      fetcher,
      session.apiUrl,
      authorization,
      session.mailAccountId,
      config.from,
    ),
    Promise.all(
      (message.attachments ?? []).map((attachment) =>
        uploadAttachment(
          fetcher,
          session.uploadUrl,
          authorization,
          session.mailAccountId,
          attachment,
        ),
      ),
    ),
  ]);

  const envelope = await jmapCall(
    fetcher,
    session.apiUrl,
    authorization,
    buildSendCalls({
      mailAccountId: session.mailAccountId,
      submissionAccountId: session.submissionAccountId,
      draftsId: context.draftsId,
      sentId: context.sentId,
      identityId: context.identityId,
      from: config.from,
      fromName: config.fromName,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments,
    }),
  );
  assertJmapSuccess(envelope, "Stalwart email send");

  const submission = methodResult<{
    created?: Record<string, { id?: string }>;
  }>(envelope, "EmailSubmission/set");
  const submissionId = submission.created?.s1?.id;
  if (!submissionId) {
    throw new Error("Stalwart did not queue the message for delivery");
  }
  return submissionId;
}
