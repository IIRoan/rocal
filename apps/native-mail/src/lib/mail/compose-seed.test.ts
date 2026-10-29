import { buildDraftMethodCalls } from "@workspace/calendar-core";
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
    expect(decryptPgpMimeMessage).toHaveBeenCalledWith(runtime, "d1", draft.bodyStructure);
  });

  it("still opens the headers with an error when the draft cannot be decrypted", async () => {
    (decryptPgpMimeMessage as jest.Mock).mockRejectedValueOnce(new Error("No key"));

    await expect(decryptDraftFields({} as MailRuntime, draft)).resolves.toEqual({
      fields: { to: "ann@example.com", cc: "", bcc: "", subject: "Plans", body: "" },
      error: "No key",
    });
  });
});
