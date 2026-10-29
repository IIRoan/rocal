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
