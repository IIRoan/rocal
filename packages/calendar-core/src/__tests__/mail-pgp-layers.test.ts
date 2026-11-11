import { describe, expect, it } from "@jest/globals";

import {
  decryptPgpMessageLayers,
  getPgpMimeEnvelopeContentType,
  MAX_PGP_ENVELOPE_BYTES,
  MAX_PGP_DECRYPT_BYTES,
  containsArmoredPgpMessage,
  isCompleteArmoredPgpMessage,
  isNestedArmoredPgpMessage,
  mergeSignatureVerificationState,
  PGP_MESSAGE_BEGIN,
  PGP_MESSAGE_END,
  resolveLayerSignatureVerificationState,
  resolveNestedPgpMimeCiphertext,
} from "../mail-pgp-layers";

describe("mail pgp layer helpers", () => {
  it("bounds root-envelope header inspection before either MIME decoder is called", () => {
    const headers = 'Content-Type: multipart/encrypted; boundary="x"\n' + "X-Other: a\n".repeat(100_000);
    expect(getPgpMimeEnvelopeContentType(headers + "\n--x--")).toBeNull();
    expect(getPgpMimeEnvelopeContentType("plain paragraph ".repeat(100_000) + "\n\nbody")).toBeNull();
    expect(getPgpMimeEnvelopeContentType('Content-Type: multipart/encrypted; boundary="x"\n\n--x--')).toBe('multipart/encrypted; boundary="x"');
  });
  it("detects armored PGP envelopes", () => {
    expect(containsArmoredPgpMessage("plain text")).toBe(false);
    expect(
      containsArmoredPgpMessage(
        `${PGP_MESSAGE_BEGIN}\nabc\n${PGP_MESSAGE_END}`,
      ),
    ).toBe(true);
  });

  it("detects complete armored envelopes", () => {
    expect(isCompleteArmoredPgpMessage(`${PGP_MESSAGE_BEGIN}\nabc`)).toBe(
      false,
    );
    expect(
      isCompleteArmoredPgpMessage(
        `${PGP_MESSAGE_BEGIN}\nabc\n${PGP_MESSAGE_END}`,
      ),
    ).toBe(true);
  });

  it("detects nested armored envelopes", () => {
    const nested = [
      PGP_MESSAGE_BEGIN,
      "outer",
      PGP_MESSAGE_END,
      PGP_MESSAGE_BEGIN,
      "inner",
      PGP_MESSAGE_END,
    ].join("\n");

    expect(isNestedArmoredPgpMessage(nested)).toBe(true);
    expect(
      isNestedArmoredPgpMessage(
        `${PGP_MESSAGE_BEGIN}\nonly-one\n${PGP_MESSAGE_END}`,
      ),
    ).toBe(false);
  });

  it("merges signature states with failed taking priority", () => {
    expect(mergeSignatureVerificationState("verified", "failed")).toBe(
      "failed",
    );
    expect(mergeSignatureVerificationState("unverified", "verified")).toBe(
      "verified",
    );
    expect(mergeSignatureVerificationState("not_signed", "unverified")).toBe(
      "unverified",
    );
  });

  it("resolves per-layer signature verification", async () => {
    await expect(
      resolveLayerSignatureVerificationState({
        signatures: undefined,
        hasVerificationKey: true,
      }),
    ).resolves.toBe("not_signed");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.resolve(true) }],
        hasVerificationKey: false,
      }),
    ).resolves.toBe("unverified");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.resolve(true) }],
        hasVerificationKey: true,
      }),
    ).resolves.toBe("verified");

    await expect(
      resolveLayerSignatureVerificationState({
        signatures: [{ verified: Promise.reject(new Error("bad sig")) }],
        hasVerificationKey: true,
      }),
    ).resolves.toBe("failed");
  });
});

describe("nested encrypted MIME boundary", () => {
  const ciphertext = `${PGP_MESSAGE_BEGIN}\nSYNTHETIC\n${PGP_MESSAGE_END}`;
  const control = { type: "application/pgp-encrypted", body: "Version: 1\r\n" };
  const payload = { type: "application/octet-stream", body: ciphertext };

  it("accepts exactly the PGP control and ciphertext parts, including legacy missing protocol", () => {
    for (const contentType of [
      'multipart/encrypted; protocol="application/pgp-encrypted"',
      "multipart/encrypted",
    ]) {
      expect(
        resolveNestedPgpMimeCiphertext({
          contentType,
          parts: [control, payload],
        }),
      ).toBe(ciphertext);
    }
  });

  it("does not treat a normal MIME attachment as another cryptographic layer", () => {
    expect(
      resolveNestedPgpMimeCiphertext({
        contentType: "multipart/mixed",
        parts: [control, payload],
      }),
    ).toBeNull();
  });

  it.each([
    [control],
    [{ ...control, body: "Version: 2" }, payload],
    [control, { ...payload, type: "text/plain" }],
    [control, { ...payload, body: "SYNTHETIC plaintext" }],
    [control, payload, payload],
  ])("rejects malformed encrypted MIME parts", (...parts) => {
    expect(() =>
      resolveNestedPgpMimeCiphertext({
        contentType: "multipart/encrypted",
        parts,
      }),
    ).toThrow();
  });
});

describe("mail decryption byte budgets", () => {
  it("allows a server-sized ciphertext envelope above64MiB while keeping decompression bounded", async () => {
    const ciphertext = "x".repeat(75_000_000);
    const result = await decryptPgpMessageLayers({ armoredMessage:ciphertext, decryptLayer:async () => ({plaintext:"Readable body",hasVerificationKey:false}), extractMimeCiphertext:() => null });
    expect(result.plaintext).toBe("Readable body");
  });

  it("refuses oversized input before decryption and oversized plaintext before parsing", async () => {
    let decrypts = 0;
    const input = { decryptLayer:async () => { decrypts += 1; return {plaintext:"x".repeat(MAX_PGP_DECRYPT_BYTES + 1),hasVerificationKey:false}; }, extractMimeCiphertext:() => null };
    await expect(decryptPgpMessageLayers({...input,armoredMessage:"x".repeat(MAX_PGP_ENVELOPE_BYTES + 1)})).rejects.toThrow("size limit");
    expect(decrypts).toBe(0);
    await expect(decryptPgpMessageLayers({...input,armoredMessage:"bounded"})).rejects.toThrow("size limit");
    expect(decrypts).toBe(1);
  });
});
