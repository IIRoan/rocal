import { INLINE_IMAGE_PLACEHOLDER } from "@workspace/calendar-core";
import { composeFormReducer, hasComposeHtmlEdits, INITIAL_COMPOSE_FORM } from "./compose-form";

const replyAll = { to: "ann@example.com", cc: "bo@example.com", bcc: "", subject: "Re: Plans", body: "> hi", htmlBody: "" };

describe("composeFormReducer", () => {
  it("advances the body source only for changes made outside the editor", () => {
    const edited = composeFormReducer(INITIAL_COMPOSE_FORM, { type: "edit", field: "body", value: "Draft" });
    expect(edited.bodySourceVersion).toBe(INITIAL_COMPOSE_FORM.bodySourceVersion);

    const signed = composeFormReducer(edited, { type: "editBody", update: (body) => `${body}\nSignature` });
    expect(signed).toMatchObject({ body: "Draft\nSignature", bodySourceVersion: edited.bodySourceVersion + 1 });
  });

  it("seeds the fields as the baseline and opens Cc/Bcc when they hold recipients", () => {
    const state = composeFormReducer(INITIAL_COMPOSE_FORM, {
      type: "seed",
      plan: { kind: "fields", fields: replyAll },
    });
    expect(state).toMatchObject({ ...replyAll, showCcBcc: true, draftId: null });
    expect(state.seed).toEqual({ to: replyAll.to, cc: replyAll.cc, bcc: "", subject: replyAll.subject, body: replyAll.body });
  });

  it("restores an undone send as edited, with its attachments and sealed copy", () => {
    const fields = { to: "ann@example.com", cc: "", bcc: "", subject: "Plans", body: "Hi", htmlBody: "<p>Hi</p>" };
    const attachments = [{ id: "a", name: "a.txt", type: "text/plain", size: 1, bytes: new Uint8Array([1]) }];
    const state = composeFormReducer(INITIAL_COMPOSE_FORM, {
      type: "seed",
      plan: { kind: "fields", fields, draftId: "copy", restoredAttachments: attachments },
    });
    expect(state).toMatchObject({ ...fields, draftId: "copy", attachments, seed: { to: "", cc: "", bcc: "", subject: "", body: "" } });
  });

  it("holds an encrypted draft's id while it decrypts, then seeds the decrypted fields", () => {
    const decrypting = composeFormReducer(INITIAL_COMPOSE_FORM, {
      type: "seed",
      plan: { kind: "decrypt-draft", draftId: "d1" },
    });
    expect(decrypting).toMatchObject({ decrypting: true, draftId: "d1", seed: null });
    const opened = composeFormReducer(decrypting, { type: "decrypted", fields: { ...replyAll, cc: "" } });
    expect(opened).toMatchObject({ decrypting: false, draftId: "d1", body: "> hi", showCcBcc: false });
  });

  it("leaves the form unseeded when the draft cannot be decrypted", () => {
    const failed = composeFormReducer(
      { ...INITIAL_COMPOSE_FORM, decrypting: true, draftId: "d1" },
      { type: "decrypted", fields: null },
    );
    expect(failed).toMatchObject({ decrypting: false, seed: null, body: "" });
  });

  it("takes the editor's HTML with its plain projection, and drops HTML a plain edit replaces", () => {
    const rich = composeFormReducer(INITIAL_COMPOSE_FORM, { type: "editHtml", html: "<p>Hi <strong>Ann</strong></p>" });
    expect(rich).toMatchObject({ htmlBody: "<p>Hi <strong>Ann</strong></p>", body: "Hi Ann", bodySourceVersion: 0 });
    expect(composeFormReducer(rich, { type: "edit", field: "body", value: "Hi" })).toMatchObject({ body: "Hi", htmlBody: "" });
  });

  it("fills loaded quoted images and drops failed ones without reloading the editor", () => {
    const placeholder = (cid: string) => `<img src="${INLINE_IMAGE_PLACEHOLDER}" data-cid="${cid}">`;
    const state = { ...INITIAL_COMPOSE_FORM, htmlBody: `<div data-quoted-html><p>Logo ${placeholder("a@x")}${placeholder("b@x")}</p></div>` };
    const next = composeFormReducer(state, {
      type: "hydrateImages",
      cidToDataUrl: new Map([["a@x", "data:image/png;base64,AA=="]]),
      failed: new Set(["b@x"]),
    });
    expect(next.htmlBody).toBe('<div data-quoted-html><p>Logo <img src="data:image/png;base64,AA==" data-cid="a@x"></p></div>');
    // The page gets the same change through updateImages, so its caret and typing stay.
    expect(next.bodySourceVersion).toBe(state.bodySourceVersion);
  });

  it("counts a formatting-only edit once the editor has posted its baseline, but not the editor's normalising", () => {
    const seeded = composeFormReducer(INITIAL_COMPOSE_FORM, {
      type: "seed",
      plan: { kind: "fields", fields: { to: "", cc: "", bcc: "", subject: "", body: "Hi", htmlBody: "<div><p>Hi</p></div>" } },
    });
    const loaded = composeFormReducer(seeded, { type: "editorBaseline", html: "<p>Hi</p>" });
    expect(hasComposeHtmlEdits(loaded)).toBe(false);
    expect(hasComposeHtmlEdits(composeFormReducer(loaded, { type: "editHtml", html: "<p>Hi</p>" }))).toBe(false);
    const bolded = composeFormReducer(loaded, { type: "editHtml", html: "<p><strong>Hi</strong></p>" });
    expect(bolded.body).toBe(loaded.body);
    expect(hasComposeHtmlEdits(bolded)).toBe(true);
  });

  it("fills loaded quoted images without reloading the editor and keeps the baseline in step", () => {
    const html = `<p>Hi</p><img src="${INLINE_IMAGE_PLACEHOLDER}" data-cid="a@x">`;
    const seeded = composeFormReducer(
      composeFormReducer(INITIAL_COMPOSE_FORM, {
        type: "seed",
        plan: { kind: "fields", fields: { to: "", cc: "", bcc: "", subject: "", body: "Hi", htmlBody: html } },
      }),
      { type: "editorBaseline", html },
    );
    const hydrated = composeFormReducer(seeded, {
      type: "hydrateImages",
      cidToDataUrl: new Map([["a@x", "data:image/png;base64,AA=="]]),
      failed: new Set(),
    });
    expect(hydrated.bodySourceVersion).toBe(seeded.bodySourceVersion);
    expect(hydrated.htmlBody).toContain("data:image/png;base64,AA==");
    expect(hydrated.editorBaseline).toBe(hydrated.htmlBody);
    expect(hasComposeHtmlEdits(hydrated)).toBe(false);
  });
});
