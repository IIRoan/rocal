import { composeFormReducer, INITIAL_COMPOSE_FORM } from "./compose-form";

const replyAll = { to: "ann@example.com", cc: "bo@example.com", bcc: "", subject: "Re: Plans", body: "> hi" };

describe("composeFormReducer", () => {
  it("seeds the fields as the baseline and opens Cc/Bcc when they hold recipients", () => {
    const state = composeFormReducer(INITIAL_COMPOSE_FORM, {
      type: "seed",
      plan: { kind: "fields", fields: replyAll },
    });
    expect(state).toMatchObject({ ...replyAll, seed: replyAll, showCcBcc: true, draftId: null });
  });

  it("restores an undone send as edited, with its attachments and sealed copy", () => {
    const fields = { to: "ann@example.com", cc: "", bcc: "", subject: "Plans", body: "Hi" };
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
});
