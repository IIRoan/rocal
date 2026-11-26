import { describe, expect, it } from "@jest/globals";
import {
  MAIL_SIGNATURE_LIMITS,
  composeSignatureCandidates,
  composeSignatureKind,
  deleteMailSignature,
  listComposeSignatureOptions,
  normalizeMailSignatureDefaults,
  normalizeMailSignatures,
  replaceComposePlainTextSignature,
  resolveComposeSignature,
  saveMailSignature,
  setMailSignatureDefault,
  validateMailSignatureDraft,
  type MailSignature,
  type MailSignatureSettings,
} from "../mail-signatures";
import { insertPlainTextSignature, signatureTextToHtml } from "../mail-signature";
import { sanitizeMailSyncedSettings } from "../mail-synced-settings";

const work: MailSignature = { id: "s-work", name: "Work", body: "Alex Doe\nSolace" };
const short: MailSignature = { id: "s-short", name: "Short", body: "Alex" };
const identities = [
  { id: "id-1", email: "alex@solace.test", textSignature: "Server signature" },
  { id: "id-2", email: "alias@solace.test", textSignature: null },
];
const sealed: MailSignatureSettings = {
  signatures: [work, short],
  signatureDefaults: [
    { identityId: "id-1", newMessage: "s-work", replyForward: "s-short" },
    { identityId: "id-2", newMessage: null, replyForward: "s-work" },
  ],
};
const QUOTE = "\n\nOn Monday, Sam wrote:\n> Hello";

describe("normalizing stored signatures", () => {
  it("keeps valid entries and drops malformed, unknown-key, duplicate and oversized ones", () => {
    expect(
      normalizeMailSignatures([
        work,
        { ...work, name: "Again" },
        { id: "x", name: " ", body: "x" },
        { id: "y", name: "Html", body: "x", html: "<b>x</b>" },
        { id: "z", name: "Long", body: "x".repeat(MAIL_SIGNATURE_LIMITS.body + 1) },
        short,
      ]),
    ).toEqual([work, short]);
    expect(normalizeMailSignatures("nope")).toEqual([]);
    const many = Array.from({ length: 15 }, (_, index) => ({ id: `s${index}`, name: `S${index}`, body: "x" }));
    expect(normalizeMailSignatures(many)).toHaveLength(MAIL_SIGNATURE_LIMITS.count);
  });

  it("keeps one default per identity", () => {
    expect(
      normalizeMailSignatureDefaults([
        { identityId: "id-1", newMessage: "s-work", replyForward: null },
        { identityId: "id-1", newMessage: null, replyForward: null },
        { identityId: "id-2", newMessage: 4, replyForward: null },
      ]),
    ).toEqual([{ identityId: "id-1", newMessage: "s-work", replyForward: null }]);
  });

  it("round-trips inside the sealed compose group", () => {
    const synced = sanitizeMailSyncedSettings({ compose: { ...sealed, signatures: [work, { id: 1 }] } });
    expect(synced.compose.signatures).toEqual([work]);
    expect(synced.compose.signatureDefaults).toEqual(sealed.signatureDefaults);
    expect(sanitizeMailSyncedSettings({}).compose).toMatchObject({ signatures: [], signatureDefaults: [] });
  });
});

describe("validateMailSignatureDraft", () => {
  it("asks for a name and text, and rejects a duplicate name except on the one being edited", () => {
    expect(validateMailSignatureDraft({ name: " ", body: " " }, [], null)).toEqual({
      name: "Give the signature a name.",
      body: "Write the text this signature adds.",
    });
    expect(validateMailSignatureDraft({ name: "work", body: "x" }, [work], null).name).toBe(
      "You already have a signature with this name.",
    );
    expect(validateMailSignatureDraft({ name: "work", body: "x" }, [work], "s-work")).toEqual({});
  });

  it("enforces the field, count and total size limits", () => {
    expect(validateMailSignatureDraft({ name: "n".repeat(81), body: "b".repeat(2_001) }, [], null)).toEqual({
      name: "Use 80 characters or fewer.",
      body: "Use 2,000 characters or fewer.",
    });
    const full = Array.from({ length: MAIL_SIGNATURE_LIMITS.count }, (_, index) => ({
      id: `s${index}`,
      name: `S${index}`,
      body: "x",
    }));
    expect(validateMailSignatureDraft({ name: "New", body: "x" }, full, null).form).toMatch(/up to 10 signatures/);
    const large = Array.from({ length: 3 }, (_, index) => ({ id: `s${index}`, name: `S${index}`, body: "é".repeat(1_000) }));
    expect(validateMailSignatureDraft({ name: "New", body: "é".repeat(1_000) }, large, null).form).toMatch(
      /signatures are full/,
    );
  });
});

describe("saving and deleting signatures", () => {
  it("makes the first signature every identity's default and leaves later ones out", () => {
    const first = saveMailSignature({ signatures: [], signatureDefaults: [] }, { name: " Work ", body: " Alex \n" }, null, ["id-1", "id-2"]);
    expect(first.id).toMatch(/^[0-9a-f]{32}$/);
    expect(first.signatures).toEqual([{ id: first.id, name: "Work", body: "Alex" }]);
    expect(first.signatureDefaults).toEqual([
      { identityId: "id-1", newMessage: first.id, replyForward: first.id },
      { identityId: "id-2", newMessage: first.id, replyForward: first.id },
    ]);
    const second = saveMailSignature(first, { name: "Home", body: "A." }, null, ["id-1"]);
    expect(second.signatureDefaults).toEqual(first.signatureDefaults);
    const edited = saveMailSignature(second, { name: "Office", body: "Alex D." }, first.id);
    expect(edited.signatures[0]).toEqual({ id: first.id, name: "Office", body: "Alex D." });
  });

  it("clears a deleted signature from the defaults that used it", () => {
    expect(deleteMailSignature(sealed, "s-work")).toEqual({
      signatures: [short],
      signatureDefaults: [{ identityId: "id-1", newMessage: null, replyForward: "s-short" }],
    });
  });

  it("sets and clears one default without touching the other", () => {
    const set = setMailSignatureDefault([], "id-3", "replyForward", "s-short");
    expect(set).toEqual([{ identityId: "id-3", newMessage: null, replyForward: "s-short" }]);
    expect(setMailSignatureDefault(set, "id-3", "newMessage", "s-work")).toEqual([
      { identityId: "id-3", newMessage: "s-work", replyForward: "s-short" },
    ]);
    expect(setMailSignatureDefault(set, "id-3", "replyForward", null)).toEqual([]);
  });
});

describe("resolving the compose signature", () => {
  it("falls back to the identity's own signature until one is saved", () => {
    const none = { signatures: [], signatureDefaults: [] };
    expect(resolveComposeSignature(none, identities, "id-1", "newMessage")).toBe(identities[0]);
    expect(resolveComposeSignature(none, identities, "id-2", "replyForward")).toBe(identities[0]);
    expect(resolveComposeSignature(none, identities, "id-1", "newMessage", null)).toBeNull();
  });

  it("uses the sealed default for the identity and message kind, never the server copy", () => {
    expect(resolveComposeSignature(sealed, identities, "id-1", "newMessage")).toEqual({ id: "s-work", textSignature: work.body });
    expect(resolveComposeSignature(sealed, identities, "id-1", "replyForward")).toEqual({ id: "s-short", textSignature: "Alex" });
    expect(resolveComposeSignature(sealed, identities, "id-2", "newMessage")).toBeNull();
    expect(resolveComposeSignature(sealed, identities, null, "replyForward")?.id).toBe("s-short");
    expect(resolveComposeSignature(sealed, identities, "id-2", "newMessage", "s-short")?.id).toBe("s-short");
  });

  it("maps compose modes to new messages or replies and forwards", () => {
    expect(["reply", "reply-all", "forward", "new", "draft", undefined].map(composeSignatureKind)).toEqual([
      "replyForward",
      "replyForward",
      "replyForward",
      "newMessage",
      "newMessage",
      "newMessage",
    ]);
  });

  it("inserts the sealed signature as text and escapes it for HTML", () => {
    const signature = resolveComposeSignature(
      { signatures: [{ id: "s1", name: "Html", body: "A & B <co>" }], signatureDefaults: [{ identityId: "id-1", newMessage: "s1", replyForward: null }] },
      identities,
      "id-1",
      "newMessage",
    );
    expect(insertPlainTextSignature("Hi", signature, { separator: true, aboveQuote: false })).toBe("Hi\n\n-- \nA & B <co>");
    expect(signatureTextToHtml(signature?.textSignature ?? "")).toBe("A &amp; B &lt;co&gt;");
    expect(insertPlainTextSignature(QUOTE, signature, { separator: false, aboveQuote: true })).toBe(`\n\nA & B <co>${QUOTE}`);
  });
});

describe("swapping the signature in a plain body", () => {
  const candidates = composeSignatureCandidates(sealed, identities);
  const options = { separator: true };

  it("swaps whichever saved or server signature the body holds, longest first", () => {
    const body = insertPlainTextSignature(`Hi${QUOTE}`, { textSignature: work.body }, { ...options, aboveQuote: true });
    expect(replaceComposePlainTextSignature(body, candidates, { textSignature: "Bye" }, options)).toBe(
      `Hi\n\n-- \nBye${QUOTE}`,
    );
    expect(replaceComposePlainTextSignature("Hi\n\n-- \nServer signature", candidates, null, options)).toBe("Hi\n\n");
  });

  it("never leaves part of a longer signature behind", () => {
    const nested = composeSignatureCandidates(
      { signatures: [short, { id: "s-ceo", name: "CEO", body: "Alex\nCEO" }], signatureDefaults: [] },
      [],
    );
    expect(replaceComposePlainTextSignature("Hi\n\n-- \nAlex\nCEO", nested, null, options)).toBe("Hi\n\n");
  });

  it("leaves a body without a known signature, or with an edited one, alone", () => {
    expect(replaceComposePlainTextSignature("Hi\n\n-- \nAlex Doe, CEO", candidates, null, options)).toBeNull();
    expect(replaceComposePlainTextSignature("Hi there", candidates, null, options)).toBeNull();
  });
});

describe("listComposeSignatureOptions", () => {
  it("lists saved signatures with the active one selected", () => {
    expect(listComposeSignatureOptions(sealed, identities, "id-1", "replyForward", undefined)).toEqual([
      { key: "s-work", choice: "s-work", name: "Work", preview: "Alex Doe Solace", selected: false },
      { key: "s-short", choice: "s-short", name: "Short", preview: "Alex", selected: true },
    ]);
  });

  it("offers the account signature until one is saved", () => {
    const none = { signatures: [], signatureDefaults: [] };
    expect(listComposeSignatureOptions(none, identities, "id-1", "newMessage", null)).toEqual([
      { key: "account", choice: undefined, name: "Account signature", preview: "Server signature", selected: false },
    ]);
    expect(listComposeSignatureOptions(none, identities.slice(1), "id-2", "newMessage", undefined)).toEqual([]);
  });
});
