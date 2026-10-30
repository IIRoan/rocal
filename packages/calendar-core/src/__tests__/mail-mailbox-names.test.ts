import { webcrypto } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import {
  createMailboxNameCipher,
  isSealedMailboxName,
  maxPlainMailboxNameLength,
  openMailboxNames,
  sealedMailboxNameLength,
  sealPlaintextMailboxNames,
  UNREADABLE_MAILBOX_NAME,
} from "../mail-mailbox-names";

const subtle = webcrypto.subtle;
const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

/** The same AES-GCM shape as `@workspace/e2ee` `encryptJsonPayload`. */
const aesGcm = {
  async encryptJsonPayload(key: CryptoKey, payload: unknown, aad?: string) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    return {
      version: 1,
      algorithm: "AES-GCM" as const,
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    };
  },
  async decryptJsonPayload<T>(
    key: CryptoKey,
    payload: { iv: string; ciphertext: string },
    aad?: string,
  ): Promise<T> {
    const plaintext = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(payload.iv),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      fromBase64Url(payload.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  },
};

const newKey = () =>
  subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]) as Promise<CryptoKey>;

describe("sealed mailbox names", () => {
  it("round-trips a name without leaving it readable, at the exact sealed length", async () => {
    const cipher = createMailboxNameCipher(aesGcm, await newKey());
    const sealed = await cipher.seal("Tax returns 2026 – €");

    expect(isSealedMailboxName(sealed)).toBe(true);
    expect(sealed).not.toContain("Tax");
    expect(sealed).not.toMatch(/[/+=]/);
    expect(sealed).toHaveLength(sealedMailboxNameLength("Tax returns 2026 – €"));
    await expect(cipher.open(sealed)).resolves.toBe("Tax returns 2026 – €");
  });

  it("shows a placeholder for a name sealed under another key or without a session", async () => {
    const sealed = await createMailboxNameCipher(aesGcm, await newKey()).seal("Work");
    const other = createMailboxNameCipher(aesGcm, await newKey());

    await expect(other.open(sealed)).resolves.toBe(UNREADABLE_MAILBOX_NAME);
    await expect(
      openMailboxNames([{ id: "w", name: sealed }, { id: "in", name: "Inbox" }], null),
    ).resolves.toEqual([
      { id: "w", name: UNREADABLE_MAILBOX_NAME },
      { id: "in", name: "Inbox" },
    ]);
  });

  it("seals only custom folders still named in plaintext", async () => {
    const cipher = createMailboxNameCipher(aesGcm, await newKey());
    const update = await sealPlaintextMailboxNames(
      [
        { id: "in", name: "Inbox", role: "inbox" },
        { id: "w", name: await cipher.seal("Work"), role: null },
        { id: "r", name: "Receipts" },
      ],
      cipher,
    );

    expect(Object.keys(update)).toEqual(["r"]);
    await expect(cipher.open(update.r?.name ?? "")).resolves.toBe("Receipts");
  });

  it("states the longest ASCII name that still fits once sealed", () => {
    const limit = maxPlainMailboxNameLength(255);
    expect(sealedMailboxNameLength("a".repeat(limit))).toBeLessThanOrEqual(255);
    expect(sealedMailboxNameLength("a".repeat(limit + 1))).toBeGreaterThan(255);
  });
});
