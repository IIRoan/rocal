import type { StalwartJmapAdminClientLike } from "./stalwart-admin";

type InternalMailboxDeliveryInput = {
  adminClient: StalwartJmapAdminClientLike;
  adminToken: string;
  accountId: string;
  mime: string;
};

type MimeMessageInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
};

function encodeMimeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }

  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

export function buildMimeMessage(input: MimeMessageInput): string {
  const mixedBoundary = `solace_mixed_${crypto.randomUUID()}`;
  const altBoundary = `solace_alt_${crypto.randomUUID()}`;
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${altBoundary}--`,
  ];

  for (const attachment of input.attachments ?? []) {
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(attachment.content, "utf8").toString("base64"),
      "",
    );
  }

  lines.push(`--${mixedBoundary}--`);
  return lines.join("\r\n");
}

async function uploadMimeBlob(input: {
  uploadUrl: string;
  accountId: string;
  adminToken: string;
  mime: string;
  fetcher: typeof fetch;
}): Promise<string> {
  const url = input.uploadUrl.replace(
    "{accountId}",
    encodeURIComponent(input.accountId),
  );
  const response = await input.fetcher(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.adminToken}`,
      "Content-Type": "message/rfc822",
    },
    body: input.mime,
  });

  if (!response.ok) {
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch {
      responseBody = "";
    }
    throw new Error(
      `Stalwart blob upload failed with status ${response.status}${
        responseBody ? `: ${responseBody.slice(0, 500)}` : "."
      }`,
    );
  }

  const payload = (await response.json()) as { blobId?: string };
  if (!payload.blobId?.trim()) {
    throw new Error("Stalwart blob upload did not return a blob id.");
  }

  return payload.blobId;
}

function getMethodResult<T>(
  envelope: { methodResponses?: Array<[string, Record<string, unknown>, string]> },
  methodName: string,
): T {
  const tuple = (envelope.methodResponses ?? []).find(
    (entry) => entry[0] === methodName,
  );

  if (!tuple) {
    throw new Error(`Stalwart JMAP response did not include ${methodName}.`);
  }

  return tuple[1] as T;
}

export async function deliverToInternalMailbox(
  input: InternalMailboxDeliveryInput,
): Promise<{ emailId: string }> {
  const session = await input.adminClient.getSession();
  const uploadUrl =
    typeof session.uploadUrl === "string" ? session.uploadUrl : null;
  if (!uploadUrl) {
    throw new Error("Stalwart JMAP session did not include an upload URL.");
  }

  const blobId = await uploadMimeBlob({
    uploadUrl,
    accountId: input.accountId,
    adminToken: input.adminToken,
    mime: input.mime,
    fetcher: fetch,
  });

  const mailboxEnvelope = await input.adminClient.callJmap({
    using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    methodCalls: [
      [
        "Mailbox/get",
        {
          accountId: input.accountId,
          ids: null,
          properties: ["id", "role"],
        },
        "mb-get",
      ],
    ],
  });
  const mailboxResult = getMethodResult<{
    list?: Array<{ id: string; role?: string | null }>;
  }>(mailboxEnvelope, "Mailbox/get");
  const inboxMailboxId =
    mailboxResult.list?.find((mailbox) => mailbox.role === "inbox")?.id ??
    mailboxResult.list?.[0]?.id;

  if (!inboxMailboxId) {
    throw new Error("Stalwart account does not have an inbox mailbox.");
  }

  const importEnvelope = await input.adminClient.callJmap({
    using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    methodCalls: [
      [
        "Email/import",
        {
          accountId: input.accountId,
          emails: {
            invite1: {
              blobId,
              mailboxIds: {
                [inboxMailboxId]: true,
              },
            },
          },
        },
        "email-import",
      ],
    ],
  });
  const importResult = getMethodResult<{
    created?: Record<string, { id?: string }>;
    notCreated?: Record<string, { description?: string }>;
  }>(importEnvelope, "Email/import");

  const created = importResult.created?.invite1;
  if (created?.id) {
    return { emailId: created.id };
  }

  const importError = importResult.notCreated?.invite1?.description;
  throw new Error(
    importError || "Stalwart did not import the invitation email.",
  );
}
