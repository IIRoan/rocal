import { collapseRecipientChips, composeTitle, isThreadReply } from "./compose-display";

describe("collapseRecipientChips", () => {
  it("shows every chip when expanded", () => {
    expect(collapseRecipientChips(["a", "b", "c"], true)).toEqual({
      visible: ["a", "b", "c"],
      hiddenCount: 0,
    });
  });

  it("keeps up to two chips visible when collapsed", () => {
    expect(collapseRecipientChips(["a", "b"], false)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 0,
    });
  });

  it("collapses longer lists to the first chip plus an overflow count", () => {
    expect(collapseRecipientChips(["a", "b", "c", "d"], false)).toEqual({
      visible: ["a"],
      hiddenCount: 3,
    });
  });
});

describe("composeTitle", () => {
  it("names what the drawer is for, never the subject", () => {
    expect(composeTitle(undefined)).toBe("New message");
    expect(composeTitle("reply")).toBe("Reply");
    expect(composeTitle("reply-all")).toBe("Reply all");
    expect(composeTitle("forward")).toBe("Forward");
    expect(composeTitle("draft")).toBe("Draft");
  });

  it("locks recipients and subject only for replies", () => {
    expect(isThreadReply("reply")).toBe(true);
    expect(isThreadReply("reply-all")).toBe(true);
    expect(isThreadReply("forward")).toBe(false);
    expect(isThreadReply("draft")).toBe(false);
    expect(isThreadReply(undefined)).toBe(false);
  });
});
