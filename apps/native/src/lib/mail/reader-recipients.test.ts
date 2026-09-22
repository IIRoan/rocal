import {
  formatAttachmentCount,
  formatReaderRecipientLine,
  readerAttachmentIcon,
} from "./reader-recipients";

describe("formatReaderRecipientLine", () => {
  it("returns empty string without recipients", () => {
    expect(formatReaderRecipientLine(undefined, [])).toBe("");
  });

  it("joins to and cc with names, falling back to email and me", () => {
    expect(
      formatReaderRecipientLine(
        [
          { name: "Kevin", email: "kevin@example.com" },
          { email: "self@example.com" },
        ],
        [{ email: "andrew@example.com" }],
        "self@example.com",
      ),
    ).toBe("To: Kevin, me, Cc: andrew@example.com");
  });

  it("shows cc alone when there is no to", () => {
    expect(
      formatReaderRecipientLine(undefined, [{ name: "Ann", email: "a@x.io" }]),
    ).toBe("Cc: Ann");
  });
});

describe("readerAttachmentIcon", () => {
  it("maps preview kinds to Feather icons", () => {
    expect(readerAttachmentIcon("image")).toBe("image");
    expect(readerAttachmentIcon("pdf")).toBe("file-text");
    expect(readerAttachmentIcon("text")).toBe("file-text");
    expect(readerAttachmentIcon(null)).toBe("file");
  });
});

describe("formatAttachmentCount", () => {
  it("pluralizes", () => {
    expect(formatAttachmentCount(1)).toBe("1 Attachment");
    expect(formatAttachmentCount(2)).toBe("2 Attachments");
  });
});
