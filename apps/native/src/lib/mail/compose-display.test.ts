import {
  collapseRecipientChips,
  composeTitle,
  recipientInitial,
} from "./compose-display";

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

describe("recipientInitial", () => {
  it("uses the first letter or digit, uppercased", () => {
    expect(recipientInitial("  jason ginsberg")).toBe("J");
    expect(recipientInitial("\"Élise\" <e@solace.onl>")).toBe("É");
    expect(recipientInitial("42@solace.onl")).toBe("4");
  });

  it("falls back when there is nothing to show", () => {
    expect(recipientInitial("  ")).toBe("?");
  });
});

describe("composeTitle", () => {
  it("prefers the subject and falls back to New message", () => {
    expect(composeTitle(" Re: Prototype Designs ")).toBe("Re: Prototype Designs");
    expect(composeTitle("   ")).toBe("New message");
  });
});
