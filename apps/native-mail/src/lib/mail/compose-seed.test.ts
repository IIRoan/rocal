import { buildDraftMethodCalls } from "@workspace/calendar-core";
import { MAX_MAIL_DISPLAY_CHARACTERS } from "@workspace/calendar-core/mail-mime-limits";
import { MAIL_DRAFT_TEXT_LIMITS } from "@workspace/calendar-core/mail-mime-parser";
import {
  decryptDraftFields,
  planComposeSeed,
  type ComposeSeedInput,
} from "./compose-seed";
import { decryptPgpMimeMessage } from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage, JmapIdentity } from "./types";

jest.mock("./mail-crypto", () => ({
  decryptMailMessage: jest.fn(),
  decryptPgpMimeMessage: jest.fn(),
}));

const me: JmapIdentity = { id: "id-1", name: "Me", email: "me@example.com", textSignature: "Me" } as JmapIdentity;

const source: JmapEmailMessage = {
  id: "m1",
  subject: "Plans",
  from: [{ name: "Ann", email: "ann@example.com" }],
  to: [{ email: "me@example.com" }],
  cc: [{ email: "bo@example.com" }],
  receivedAt: "2026-10-25T08:05:00Z",
  textBody: [{ partId: "1" }],
  bodyValues: { "1": { value: "See you there" } },
};

function plan(overrides: Partial<ComposeSeedInput>) {
  return planComposeSeed({
    params: {},
    sourceMessage: source,
    settingsLoaded: true,
    signaturePosition: "below_quote",
    signatureOptions: {},
    identity: me,
    identities: [me],
    fromEmail: "me@example.com",
    dateOptions: { timeFormat: "24h", timezone: "Europe/Amsterdam" },
    runtime: {} as MailRuntime,
    ...overrides,
  });
}

describe("planComposeSeed", () => {
  it("never seeds an oversized plaintext draft for editing or autosave", () => {
    const sourceMessage = { ...source, bodyValues: { "1": { value: "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS + 1) } } };
    expect(plan({ params: { mode: "draft" }, sourceMessage })).toBeNull();
    expect(sourceMessage.bodyValues["1"].value).toHaveLength(MAX_MAIL_DISPLAY_CHARACTERS + 1);
  });
  it("bounds both quote paths and includes the shortening marker in the submitted text", () => {
    const sourcePlaintext = "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS) + "UNQUOTED_TAIL";
    for (const mode of ["reply", "forward"] as const) {
      const seed = plan({ params: { mode }, sourcePlaintext });
      expect(seed?.kind === "fields" && seed.fields.body).toContain("[Earlier message shortened.]");
      expect(seed?.kind === "fields" && seed.fields.body).not.toContain("UNQUOTED_TAIL");
    }
  });
  it("addresses a new message from a mailto with the name shown", () => {
    expect(plan({ params: { to: "ann@example.com", toName: "Ann" }, sourceMessage: null })).toEqual({
      kind: "fields",
      fields: { to: "Ann <ann@example.com>", cc: "", bcc: "", subject: "", body: "" },
    });
  });

  it("waits for the source message and compose settings", () => {
    expect(plan({ params: { mode: "reply" }, sourceMessage: null })).toBeNull();
    expect(plan({ params: { mode: "reply" }, settingsLoaded: false })).toBeNull();
  });

  it("replies to the sender with a quoted body", () => {
    const seed = plan({ params: { mode: "reply" } });
    expect(seed).toMatchObject({
      kind: "fields",
      fields: { to: "ann@example.com", cc: "", subject: "Re: Plans" },
    });
    expect(seed?.kind === "fields" && seed.fields.body).toContain("Ann wrote:\n> See you there");
  });

  it("replies to all, keeps the signature above the quote when asked, and forwards", () => {
    const replyAll = plan({ params: { mode: "reply-all" }, signaturePosition: "above_quote" });
    expect(replyAll).toMatchObject({ fields: { to: "ann@example.com", cc: "bo@example.com" } });
    expect(replyAll?.kind === "fields" && replyAll.fields.body.indexOf("Me")).toBeLessThan(
      replyAll?.kind === "fields" ? replyAll.fields.body.indexOf("wrote:") : 0,
    );

    const forward = plan({ params: { mode: "forward" } });
    expect(forward).toMatchObject({ fields: { to: "", subject: "Fwd: Plans" } });
    expect(forward?.kind === "fields" && forward.fields.body).toContain("Forwarded message");
  });

  it("matches web reply-all semantics for Reply-To, other recipients and self aliases", () => {
    const alias = { ...me, id: "alias", email: "alias@example.com" };
    const seed = plan({
      params: { mode: "reply-all" },
      identities: [me, alias],
      sourceMessage: {
        ...source,
        replyTo: [{ email: "reply@example.com" }],
        to: [{ email: "me@example.com" }, { email: "other@example.com" }],
        cc: [{ email: "alias@example.com" }, { email: "bo@example.com" }, { email: "other@example.com" }],
      },
    });
    expect(seed).toMatchObject({ fields: { to: "reply@example.com", cc: "other@example.com, bo@example.com", bcc: "" } });
  });

  it("reopens a plain draft with its id, headers and body", () => {
    expect(plan({ params: { mode: "draft" } })).toEqual({
      kind: "fields",
      draftId: "m1",
      fields: { to: "me@example.com", cc: "bo@example.com", bcc: "", subject: "Plans", body: "See you there" },
    });
  });

  it("asks to decrypt an encrypted draft once the mailbox is unlocked", () => {
    const encrypted = {
      ...source,
      bodyValues: { "1": { value: "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----" } },
    };
    expect(plan({ params: { mode: "draft" }, sourceMessage: encrypted })).toEqual({ kind: "decrypt-draft", draftId: "m1" });
    expect(plan({ params: { mode: "draft" }, sourceMessage: encrypted, runtime: undefined })).toBeNull();
  });

  it("decrypts an encrypted message before quoting it in a reply or forward", () => {
    const encrypted = {
      ...source,
      bodyValues: { "1": { value: "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----" } },
    };
    for (const mode of ["reply", "reply-all", "forward"] as const) {
      expect(plan({ params: { mode }, sourceMessage: encrypted })).toEqual({ kind: "decrypt-source" });
      expect(plan({ params: { mode }, sourceMessage: encrypted, runtime: undefined })).toBeNull();
    }

    const reply = plan({ params: { mode: "reply" }, sourceMessage: encrypted, sourcePlaintext: "See you there" });
    const body = reply?.kind === "fields" ? reply.fields.body : "";
    expect(body).toContain("Ann wrote:\n> See you there");
    expect(body).not.toContain("BEGIN PGP");
  });

  it("opens a blank message for other requests", () => {
    expect(plan({})).toEqual({
      kind: "fields",
      fields: { to: "", cc: "", bcc: "", subject: "", body: "" },
    });
  });
});

describe("decryptDraftFields", () => {
  const [[, emailSet]] = buildDraftMethodCalls({
    draftsMailboxId: "drafts",
    fromEmail: "me@example.com",
    to: ["ann@example.com"],
    subject: "Plans",
    ciphertext: { blobId: "sealed-draft", size: 512 },
  });
  const sealed = (emailSet.create as Record<string, JmapEmailMessage>).draft1;
  const draft: JmapEmailMessage = {
    ...sealed,
    id: "d1",
    to: [{ email: "ann@example.com" }],
  };

  it("refuses an HTML-only image draft before the plain-text editor can replace its stored content", async () => {
    const html = '<p>Screenshot</p><img src="data:image/png;base64,' + "A".repeat(1_400_000) + '">';
    const plaintext = "Content-Type: text/html\r\n\r\n" + html;
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext, html, rawMimeFallback: true, signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("could not be opened safely");
    expect(result.error).toContain("saved draft has not been changed");
    expect(result.fields.body).toBe("");
  });

  it("never seeds raw MIME from a small HTML-only encrypted draft", async () => {
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext: "Content-Type: text/html\r\n\r\n<p>Keep this draft</p>", html: "<p>Keep this draft</p>", rawMimeFallback: true, signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("could not be opened safely");
    expect(result.fields.body).toBe("");
  });

  it("refuses a raw MIME parse fallback even without HTML", async () => {
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext: "raw MIME after a parser failure", html: null, rawMimeFallback: true, signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("saved draft has not been changed");
    expect(result.fields.body).toBe("");
  });

  it("keeps a real text part that happens to contain MIME-looking lines editable", async () => {
    const plaintext = "Content-Type: text/plain\n\nThis is what I wrote";
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext, html: "<p>This is what I wrote</p>", signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toBeNull();
    expect(result.fields.body).toBe(plaintext);
  });

  it("applies the plain-text edit cap to real text even when it contains MIME-looking lines", async () => {
    const plaintext = "Content-Type: text/plain\n\n" + "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS);
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext, html: "<p>A real alternative</p>", signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("too large to edit");
    expect(result.fields.body).toBe("");
  });

  it("refuses a draft whose decoding stopped at the read limit, though the returned text is short", async () => {
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext: "decoded up to the limit", truncated: true, signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("saved draft has not been changed");
    expect(result.fields.body).toBe("");
  });

  it("refuses an oversized decrypted draft without seeding any body for autosave", async () => {
    jest.mocked(decryptPgpMimeMessage).mockResolvedValueOnce({ plaintext: "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS + 1), signatureVerificationState: "not_signed", hasVerifiedSignature: false });
    const result = await decryptDraftFields({} as MailRuntime, draft);
    expect(result.error).toContain("saved draft has not been changed");
    expect(result.fields.body).toBe("");
  });

  it("opens a stored PGP/MIME draft with its decrypted body", async () => {
    (decryptPgpMimeMessage as jest.Mock).mockResolvedValueOnce({
      plaintext: "Meet at nine",
      html: "<p>Meet at nine</p>",
    });
    const runtime = {} as MailRuntime;

    await expect(decryptDraftFields(runtime, draft)).resolves.toEqual({
      fields: { to: "ann@example.com", cc: "", bcc: "", subject: "Plans", body: "Meet at nine" },
      error: null,
    });
    expect(decryptPgpMimeMessage).toHaveBeenCalledWith(runtime, "d1", draft.bodyStructure, undefined, MAIL_DRAFT_TEXT_LIMITS);
  });

  it("still opens the headers with an error when the draft cannot be decrypted", async () => {
    (decryptPgpMimeMessage as jest.Mock).mockRejectedValueOnce(new Error("No key"));

    await expect(decryptDraftFields({} as MailRuntime, draft)).resolves.toEqual({
      fields: { to: "ann@example.com", cc: "", bcc: "", subject: "Plans", body: "" },
      error: "No key",
    });
  });
});
