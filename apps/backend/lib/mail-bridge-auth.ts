import { env } from "./env";

function normalizeBase64Url(input: string): string {
  return input.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildStalwartMailBridgeRedirectUri(): string {
  return `${env.backendUrl.replace(/\/+$/, "")}/api/mail/oauth/stalwart/callback`;
}

export function getStalwartMailBridgeClientId(): string {
  return "solace-mail-bridge";
}

export async function deriveMailBridgeSecret(input: {
  userId: string;
  email: string;
}): Promise<string> {
  const hmacKey = process.env.MAIL_VAULT_HMAC_KEY?.trim() || env.mailVaultHmacKey;
  if (!hmacKey) {
    throw new Error(
      "MAIL_VAULT_HMAC_KEY is not configured on this server. Set it to a permanent random base64 secret.",
    );
  }

  const rawKey = Buffer.from(hmacKey, "base64");
  if (rawKey.length === 0) {
    throw new Error("MAIL_VAULT_HMAC_KEY is not a valid base64 secret.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(
    `${input.userId}:${input.email.trim().toLowerCase()}:mail-bridge:v1`,
  );
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return normalizeBase64Url(Buffer.from(signature).toString("base64"));
}

export async function createMailBridgePkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = normalizeBase64Url(
    Buffer.from(verifierBytes).toString("base64"),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );

  return {
    codeVerifier,
    codeChallenge: normalizeBase64Url(Buffer.from(digest).toString("base64")),
  };
}
