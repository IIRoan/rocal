import { describe, expect, it } from "@jest/globals";
import { FORWARDED_MESSAGE_HEADER, formatReplyQuoteHeader, isReplyQuoteHeader } from "./mail-quote";

describe("mail-quote", () => {
  it("recognizes the reply header both apps write, even after leading blank lines", () => {
    const header = formatReplyQuoteHeader("Nov 16, 2026, 10:00", "Maestro");
    expect(header).toBe("On Nov 16, 2026, 10:00, Maestro wrote:");
    expect(isReplyQuoteHeader(header)).toBe(true);
    expect(isReplyQuoteHeader(`\n\n${header}\n> Hello`)).toBe(true);
  });

  it("does not treat a forward or ordinary text as a reply quote", () => {
    expect(isReplyQuoteHeader(`${FORWARDED_MESSAGE_HEADER}\nFrom: peer@solace.test`)).toBe(false);
    expect(isReplyQuoteHeader("Once more, I wrote: thanks")).toBe(false);
    expect(isReplyQuoteHeader("Thanks for the note")).toBe(false);
  });
});
