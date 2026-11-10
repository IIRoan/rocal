import { getEmailDomain, parseRecipientString } from "./mail-addresses";

export type EncryptedMimeHeaders = {
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  messageId: string;
  inReplyTo?: string[];
  references?: string[];
};

function assertHeaderText(value: string): void {
  if (/[\x00-\x1f\x7f]/.test(value) || value.length > 16_384) {
    throw new Error("Encrypted message headers contain an invalid value.");
  }
}

function encodeHeader(value: string): string {
  value = value.replace(/[\t\r\n]+/g, " ");
  assertHeaderText(value);
  if (!value) return "";
  const chunks: string[] = [];
  let bytes: number[] = [];
  for (const character of value) {
    const next = new TextEncoder().encode(character);
    if (bytes.length + next.length > 36) {
      chunks.push(`=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`);
      bytes = [];
    }
    bytes.push(...next);
  }
  if (bytes.length)
    chunks.push(`=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`);
  return chunks.join("\r\n ");
}

function formatAddress(value: string): string {
  assertHeaderText(value);
  const address = parseRecipientString(value);
  return formatParsedAddress(address.email, address.name);
}

function formatParsedAddress(email: string, name?: string | null): string {
  assertHeaderText(email);
  if (
    email.length > 254 ||
    !/^[\x21-\x7e]+$/.test(email) ||
    !/^[^\s<>()\[\]\\,;:@"]+@[A-Za-z0-9.-]+$/.test(email)
  ) {
    throw new Error("Encrypted message headers contain an invalid address.");
  }
  return name ? `${encodeHeader(name)}\r\n <${email}>` : `<${email}>`;
}

function addressHeader(name: string, values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const addresses = values.map(formatAddress);
  const line = `${name}: ${addresses.join(",\r\n ")}`;
  if (
    line
      .split("\r\n")
      .some((part) => new TextEncoder().encode(part).length > 998)
  ) {
    throw new Error("Encrypted message address header is too long.");
  }
  return [line];
}

function formatMessageId(value: string): string {
  assertHeaderText(value);
  const id =
    value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value;
  if (
    !/^[\x21-\x7e]+$/.test(id) ||
    /[<>\s]/.test(id) ||
    !id.includes("@") ||
    id.length > 250
  ) {
    throw new Error("Encrypted message has an invalid reference identifier.");
  }
  return `<${id}>`;
}

function referenceHeader(name: string, values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const valid: string[] = [];
  for (const value of values) {
    try {
      valid.push(formatMessageId(value));
    } catch {
      continue;
    }
  }
  if (!valid.length) return [];
  const bounded = valid.length > 100 ? [valid[0], ...valid.slice(-99)] : valid;
  return [`${name}: ${bounded.join("\r\n ")}`];
}

export function createMailMessageId(fromEmail: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${token}@${getEmailDomain(fromEmail) ?? "localhost"}`;
}

/** A complete RFC 3156 message is imported as bytes so the server preserves its encryption protocol parameter. */
export function buildPgpMimeMessage(
  headers: EncryptedMimeHeaders,
  armoredMessage: string,
  date = new Date(),
): string {
  const normalizedArmor = armoredMessage.trim().replace(/\r\n|\r|\n/g, "\r\n");
  if (
    !normalizedArmor.startsWith("-----BEGIN PGP MESSAGE-----\r\n") ||
    !normalizedArmor.endsWith("\r\n-----END PGP MESSAGE-----") ||
    /[^\x09\x0a\x0d\x20-\x7e]/.test(normalizedArmor)
  ) {
    throw new Error(
      "Encrypted message does not contain complete armored ciphertext.",
    );
  }
  if (normalizedArmor.split("\r\n").some((line) => line.length > 998)) {
    throw new Error("Encrypted message contains an overlong armor line.");
  }
  const random = crypto.getRandomValues(new Uint8Array(12));
  const boundary =
    "solace_encrypted_" +
    Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  assertHeaderText(headers.fromEmail);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Encrypted message date is invalid.");
  const lines = [
    `From: ${formatParsedAddress(headers.fromEmail, headers.fromName)}`,
    ...addressHeader("To", headers.to),
    ...addressHeader("Cc", headers.cc),
    ...addressHeader("Bcc", headers.bcc),
    `Subject: ${encodeHeader(headers.subject)}`,
    `Date: ${date.toUTCString().replace(/GMT$/, "+0000")}`,
    `Message-ID: ${formatMessageId(headers.messageId)}`,
    ...referenceHeader("In-Reply-To", headers.inReplyTo),
    ...referenceHeader("References", headers.references),
    "MIME-Version: 1.0",
    `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: application/pgp-encrypted",
    "",
    "Version: 1",
    "",
    `--${boundary}`,
    'Content-Type: application/octet-stream; name="encrypted.asc"',
    'Content-Disposition: inline; filename="encrypted.asc"',
    "Content-Transfer-Encoding: 7bit",
    "",
    normalizedArmor,
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}
