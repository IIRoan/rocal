import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import * as openpgp from "openpgp";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  normalizeMailComposeSettings,
  parseMailComposeSettings,
} from "../mail-compose-settings";
import { parseDecryptedMailContent, readMailMimeSignedParts } from "../mail-mime-parser";
import {
  sealMailForSelf,
  sealOutgoingMessageBody,
  signOutgoingMailContent,
  SIGNED_MAIL_KEY_FILENAME,
  type MailSealer,
} from "../mail-outgoing-crypto";
import { MAIL_PGP_KEY_GENERATION_PROFILE } from "../mail-pgp-key-inspection";
import {
  resolveSignedMailContent,
  signMailDetached,
  verifyMailMimeSignature,
} from "../mail-pgp-signature";

type Keys = { privateKey: openpgp.PrivateKey; publicKeyArmored: string };

async function generate(email: string): Promise<Keys> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    ...MAIL_PGP_KEY_GENERATION_PROFILE,
    userIDs: [{ name: "Synthetic", email }],
    format: "object",
  });
  return { privateKey, publicKeyArmored: publicKey.armor() };
}

function sealerFor(keys: Keys) {
  const sign = jest.fn<NonNullable<MailSealer["sign"]>>((input) =>
    signMailDetached(input, { signingKey: keys.privateKey, isCurrent: () => true }, openpgp),
  );
  const encrypt = jest.fn<MailSealer["encrypt"]>(async (input) => ({ armoredMessage: `ARMOR(${input.plaintext.length})` }));
  const sealer: MailSealer = {
    selfPublicKeyArmored: keys.publicKeyArmored,
    isCurrent: () => true,
    encrypt,
    sign,
    upload: async () => ({ blobId: "sealed", size: 10 }),
  };
  return { sealer, sign, encrypt };
}

const content = { text: "Hello there  \nFrom here on", html: "<p>Hello <b>there</b></p>" };

let alice: Keys;
let mallory: Keys;
let entity: string;

beforeAll(async () => {
  alice = await generate("alice@solace.onl");
  mallory = await generate("mallory@example.com");
  entity = await signOutgoingMailContent(content, sealerFor(alice).sealer);
});

function signedParts(raw: string) {
  const parts = readMailMimeSignedParts(raw);
  if (!parts) throw new Error("not signed");
  return parts;
}

describe("signOutgoingMailContent", () => {
  it("builds RFC 3156 multipart/signed with the body, the public key and a detached signature whose micalg names its digest", async () => {
    expect(entity).toMatch(/^Content-Type: multipart\/signed; micalg=pgp-sha512; protocol="application\/pgp-signature"; boundary="solace_signed_[0-9a-f]{24}"\r\n\r\n/);
    expect(entity.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const parts = signedParts(entity);
    expect(parts.content).toMatch(/^Content-Type: multipart\/mixed;/);
    expect(parts.content).toContain(`Content-Type: application/pgp-keys; name="${SIGNED_MAIL_KEY_FILENAME}"`);
    expect(parts.content).toContain("Content-Transfer-Encoding: base64");
    expect(parts.content).not.toContain("Hello there");
    const signature = await openpgp.readSignature({ armoredSignature: parts.armoredSignature });
    expect(signature.packets).toHaveLength(1);
    expect(signature.packets[0]?.hashAlgorithm).toBe(openpgp.enums.hash.sha512);
    const parsed = parseDecryptedMailContent(parts.content);
    expect(parsed.text).toBe("Hello there  \r\nFrom here on");
    expect(parsed.html).toBe("<p>Hello <b>there</b></p>");
    expect(new TextDecoder().decode(parsed.attachments[0]?.content).replace(/\r\n/g, "\n").trim()).toBe(alice.publicKeyArmored.trim());
  });

  it("refuses to sign without a signing function", async () => {
    const { sealer } = sealerFor(alice);
    await expect(signOutgoingMailContent(content, { ...sealer, sign: undefined })).rejects.toThrow("Signing is unavailable");
  });
});

describe("verifyMailMimeSignature", () => {
  it("verifies with the sender's known key", async () => {
    await expect(
      verifyMailMimeSignature({ signed: signedParts(entity), senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored }, openpgp),
    ).resolves.toBe("verified");
  });

  it("falls back to the attached key only when its user ID names the sender", async () => {
    const signed = signedParts(entity);
    await expect(verifyMailMimeSignature({ signed, senderEmail: "Alice <ALICE@solace.onl>" }, openpgp)).resolves.toBe("attached_key");
    await expect(verifyMailMimeSignature({ signed, senderEmail: "bob@solace.onl" }, openpgp)).resolves.toBe("unverified");
    await expect(verifyMailMimeSignature({ signed }, openpgp)).resolves.toBe("unverified");
  });

  it("fails against a different known key", async () => {
    await expect(
      verifyMailMimeSignature({ signed: signedParts(entity), senderEmail: "alice@solace.onl", senderPublicKeyArmored: mallory.publicKeyArmored }, openpgp),
    ).resolves.toBe("failed");
  });

  it.each([
    ["a body byte", (raw: string) => raw.replace(/(Content-Transfer-Encoding: base64\r\n\r\n)(.)/, (_, head: string, char: string) => `${head}${char === "A" ? "B" : "A"}`)],
    ["a part header", (raw: string) => raw.replace("Content-Type: text/plain; charset=utf-8", "Content-Type: text/plain; charset=latin1")],
    ["an added line", (raw: string) => raw.replace(/(Content-Transfer-Encoding: base64\r\n\r\n)/, "$1\r\n")],
  ])("detects a changed %s in the signed part", async (_label, tamper) => {
    const changed = tamper(entity);
    expect(changed).not.toBe(entity);
    await expect(
      verifyMailMimeSignature({ signed: signedParts(changed), senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored }, openpgp),
    ).resolves.toBe("failed");
  });

  it("canonicalizes line ends, so LF-only decrypted text still verifies", async () => {
    const lf = entity.replace(/\r\n/g, "\n");
    const signed = signedParts(lf);
    expect(signed.signedText).not.toMatch(/[^\r]\n/);
    await expect(
      verifyMailMimeSignature({ signed, senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored }, openpgp),
    ).resolves.toBe("verified");
  });

  it("fails a signature with more than one signature packet", async () => {
    const parts = signedParts(entity);
    const double = await openpgp.sign({
      message: await openpgp.createMessage({ binary: new TextEncoder().encode(parts.signedText) }),
      signingKeys: [alice.privateKey, mallory.privateKey],
      detached: true,
    });
    await expect(
      verifyMailMimeSignature({ signed: { ...parts, armoredSignature: double }, senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored }, openpgp),
    ).resolves.toBe("failed");
  });

  it("ignores an attached key whose user ID is someone else", async () => {
    const forged = await signOutgoingMailContent(content, sealerFor(mallory).sealer);
    await expect(verifyMailMimeSignature({ signed: signedParts(forged), senderEmail: "alice@solace.onl" }, openpgp)).resolves.toBe("unverified");
  });
});

describe("readMailMimeSignedParts", () => {
  const wrap = (body: string, type = 'multipart/signed; micalg=pgp-sha256; protocol="application/pgp-signature"; boundary="b"') =>
    `Content-Type: ${type}\r\n\r\n${body}`;
  const signaturePart = "Content-Type: application/pgp-signature\r\n\r\n-----BEGIN PGP SIGNATURE-----\r\n\r\nAAAA\r\n-----END PGP SIGNATURE-----\r\n";
  const textPart = "Content-Type: text/plain\r\n\r\nHi";

  it("returns null for content that is not PGP multipart/signed", () => {
    expect(readMailMimeSignedParts(textPart)).toBeNull();
    expect(readMailMimeSignedParts(wrap(`--b\r\n${textPart}\r\n--b--`, 'multipart/signed; protocol="application/pkcs7-signature"; boundary="b"'))).toBeNull();
  });

  it("splits exactly two parts and keeps part one byte for byte", () => {
    const parts = readMailMimeSignedParts(wrap(`preamble\r\n--b\r\n${textPart}\r\n--b \r\n${signaturePart}\r\n--b--\r\nepilogue`));
    expect(parts).toEqual({
      signedText: textPart,
      content: textPart,
      armoredSignature: "-----BEGIN PGP SIGNATURE-----\n\nAAAA\n-----END PGP SIGNATURE-----",
    });
  });

  it.each([
    ["a third part", wrap(`--b\r\n${textPart}\r\n--b\r\n${signaturePart}\r\n--b\r\n${textPart}\r\n--b--`)],
    ["a missing closing delimiter", wrap(`--b\r\n${textPart}\r\n--b\r\n${signaturePart}`)],
    ["a missing boundary", wrap(`--b\r\n${textPart}\r\n--b--`, 'multipart/signed; protocol="application/pgp-signature"')],
    ["a wrong signature type", wrap(`--b\r\n${textPart}\r\n--b\r\n${signaturePart.replace("pgp-signature", "octet-stream")}\r\n--b--`)],
    ["two armored signatures", wrap(`--b\r\n${textPart}\r\n--b\r\n${signaturePart}${signaturePart.slice(signaturePart.indexOf("-----BEGIN"))}\r\n--b--`)],
    ["an oversized signature", wrap(`--b\r\n${textPart}\r\n--b\r\nContent-Type: application/pgp-signature\r\n\r\n-----BEGIN PGP SIGNATURE-----\r\n${"A".repeat(40_000)}\r\n-----END PGP SIGNATURE-----\r\n--b--`)],
    ["a signature without armor", wrap(`--b\r\n${textPart}\r\n--b\r\nContent-Type: application/pgp-signature\r\n\r\nnot armor\r\n--b--`)],
  ])("rejects %s", (_label, raw) => {
    expect(() => readMailMimeSignedParts(raw)).toThrow();
  });
});

describe("resolveSignedMailContent", () => {
  it("reads the signed part and merges its signature state", async () => {
    const result = await resolveSignedMailContent(
      { plaintext: entity, signatureVerificationState: "not_signed", senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored },
      openpgp,
    );
    expect(result).toMatchObject({ signatureVerificationState: "verified", hasVerifiedSignature: true });
    expect(result.plaintext).toBe(signedParts(entity).content);
  });

  it("keeps a failed outer layer failed", async () => {
    const result = await resolveSignedMailContent(
      { plaintext: entity, signatureVerificationState: "failed", senderEmail: "alice@solace.onl", senderPublicKeyArmored: alice.publicKeyArmored },
      openpgp,
    );
    expect(result.signatureVerificationState).toBe("failed");
  });

  it("marks malformed signed mail failed and leaves it to the parser", async () => {
    const malformed = entity.slice(0, entity.lastIndexOf("--solace_signed_"));
    await expect(
      resolveSignedMailContent({ plaintext: malformed, signatureVerificationState: "not_signed", senderEmail: "alice@solace.onl" }, openpgp),
    ).resolves.toEqual({ plaintext: malformed, signatureVerificationState: "failed", hasVerifiedSignature: false });
  });

  it("leaves unsigned mail and S/MIME untouched", async () => {
    const plain = "Content-Type: text/plain\r\n\r\nHi";
    await expect(
      resolveSignedMailContent({ plaintext: plain, signatureVerificationState: "verified" }, openpgp),
    ).resolves.toEqual({ plaintext: plain, signatureVerificationState: "verified", hasVerifiedSignature: true });
  });
});

describe("sealOutgoingMessageBody signing", () => {
  const getRecipientPublicKey = async (email: string) => `key:${email}`;

  it("sends signed PGP/MIME to outside recipients with a sealed Sent copy of the unsigned content", async () => {
    const { sealer, sign, encrypt } = sealerFor(alice);
    const body = await sealOutgoingMessageBody({
      recipients: ["bob@example.com"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content,
      sealer,
      getRecipientPublicKey,
      sign: true,
    });
    expect(body).toMatchObject({ kind: "signed", encrypted: false, textBody: "", sentCopyCiphertext: { blobId: "sealed", size: 10 } });
    expect(body.signedMimeMessage).toMatch(/^Content-Type: multipart\/signed;/);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(1);
    expect(encrypt.mock.calls[0]?.[0].recipientPublicKeysArmored).toEqual([alice.publicKeyArmored]);
    expect(encrypt.mock.calls[0]?.[0].plaintext).not.toContain("multipart/signed");
  });

  it("keeps plaintext external mail unsigned when the setting is off", async () => {
    const { sealer, sign } = sealerFor(alice);
    const body = await sealOutgoingMessageBody({
      recipients: ["bob@example.com"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content,
      sealer,
      getRecipientPublicKey,
    });
    expect(body.kind).toBe("plaintext");
    expect(sign).not.toHaveBeenCalled();
  });

  it("signs internal mail only inside its ciphertext", async () => {
    const { sealer, sign } = sealerFor(alice);
    const body = await sealOutgoingMessageBody({
      recipients: ["bob@solace.onl"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content,
      sealer,
      getRecipientPublicKey,
      sign: true,
    });
    expect(body.kind).toBe("inline");
    expect(sign).not.toHaveBeenCalled();
  });

  it("never signs drafts", async () => {
    const { sealer, sign, encrypt } = sealerFor(alice);
    await sealMailForSelf(content, sealer);
    expect(sign).not.toHaveBeenCalled();
    expect(encrypt.mock.calls[0]?.[0].plaintext).not.toContain("multipart/signed");
  });
});

describe("signOutgoingMail setting", () => {
  it("defaults off and keeps only booleans", () => {
    expect(DEFAULT_MAIL_COMPOSE_SETTINGS.signOutgoingMail).toBe(false);
    expect(parseMailComposeSettings(null).signOutgoingMail).toBe(false);
    expect(normalizeMailComposeSettings({ signOutgoingMail: "yes" }).signOutgoingMail).toBe(false);
    expect(normalizeMailComposeSettings({ signOutgoingMail: true }).signOutgoingMail).toBe(true);
  });
});
