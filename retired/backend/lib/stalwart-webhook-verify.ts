import { createHmac, timingSafeEqual } from "node:crypto";

const BASE64_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]+=*$/;

export function verifyStalwartWebhookSignature(input: {
  body: string;
  signatureHeader: string | null | undefined;
  secret: string;
}): boolean {
  const signatureHeader = input.signatureHeader?.trim();
  if (!signatureHeader || !input.secret) {
    return false;
  }

  if (!BASE64_SIGNATURE_PATTERN.test(signatureHeader)) {
    return false;
  }

  const expected = createHmac("sha256", input.secret)
    .update(input.body, "utf8")
    .digest();
  const provided = Buffer.from(signatureHeader, "base64");

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}
