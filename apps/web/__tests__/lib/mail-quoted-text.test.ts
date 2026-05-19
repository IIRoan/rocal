/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";

import {
  splitPlaintextQuote,
  splitHtmlQuote,
} from "../../lib/mail/quoted-text";

describe("splitPlaintextQuote", () => {
  it("returns the full text as body when there is no quote", () => {
    const text = "Hello world\nHow are you?";
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(text);
    expect(result.quote).toBeNull();
  });

  it("splits app-generated separator: \\n\\n---\\nOn <date>, <email> wrote:", () => {
    const body = "hiii :))";
    const quote =
      "On 19/05/2026, 19:23:11, vanwesteropbroan@gmail.com wrote:\n1351356";
    const text = `${body}\n\n---\n${quote}`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).toContain("wrote:");
  });

  it("splits Gmail ISO-date style: On DD/MM/YYYY, HH:MM:SS, email wrote:", () => {
    const body = "Nice to meet you!";
    const text =
      `${body}\n\nOn 19/05/2026, 17:27:45, vanwesteropbroan@gmail.com wrote:\nsee files attached`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("splits Gmail weekday format: On Mon, 1 Jan 2026 at 12:00, Name <email> wrote:", () => {
    const body = "Thanks for the reply!";
    const text =
      `${body}\n\nOn Tue, 19 May 2026 at 19:59, <testingproduction15@solace.onl> wrote:\nhiii :))`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("splits classic Outlook separator ---- Original Message ----", () => {
    const body = "Please see below";
    const text = `${body}\n---- Original Message ----\nFrom: test@example.com`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("splits Outlook From/Sent/To header block", () => {
    const body = "See attached";
    const text =
      `${body}\nFrom: sender@example.com\nSent: Mon, 19 May 2026 12:00\nTo: recipient@example.com\nSubject: Hello`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("does not split when the quote delimiter appears at the very start", () => {
    // If there's no real body, return the full text unsplit
    const text = "\n\n---\nOn 19/05/2026, sender@example.com wrote:\nhello";
    const result = splitPlaintextQuote(text);
    // Body would be empty, so no split
    expect(result.quote).toBeNull();
  });

  it("handles CRLF line endings from JMAP server (app-generated separator)", () => {
    // JMAP spec §4.1.4 requires CRLF in bodyValues; patterns must still match
    const body = "hi";
    const quote = "On 20/05/2026, 12:00:00, sender@example.com wrote:\noriginal";
    const text = `${body}\r\n\r\n---\r\n${quote}`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("normalises CRLF in the returned body", () => {
    const text = "Hello\r\nWorld\r\n\r\n---\r\nOn 20/05/2026, sender@example.com wrote:\nquote";
    const result = splitPlaintextQuote(text);
    // Body must use \n (normalised), not \r\n
    expect(result.body).not.toContain("\r");
    expect(result.body).toBe("Hello\nWorld");
  });

  it("handles single newline before --- separator (Pattern 4 fallback)", () => {
    // When only one blank line before ---, Pattern 4 catches it
    const body = "hi";
    const text = `${body}\n---\nOn 19/05/2026, 20:00:34, vanwesteropbroan@gmail.com wrote:\njaja`;
    const result = splitPlaintextQuote(text);
    expect(result.body).toBe(body);
    expect(result.quote).not.toBeNull();
  });

  it("handles sent message with nested Gmail quoted chain", () => {
    // Full realistic sent message body including forwarded Gmail quote chain
    const text = [
      "hi",
      "",
      "---",
      "On 19/05/2026, 20:00:34, vanwesteropbroan@gmail.com wrote:",
      "jaja",
      "",
      "On Tue, 19 May 2026 at 19:59, <testingproduction15@solace.onl> wrote:",
      "> hiii :))",
      ">",
      ">",
      "> ---",
      "> On 19/05/2026, 19:23:11, vanwesteropbroan@gmail.com wrote:",
      "> 1351356",
    ].join("\n");
    const result = splitPlaintextQuote(text);
    // Only the top-level user text should be body
    expect(result.body).toBe("hi");
    expect(result.quote).not.toBeNull();
  });


  it("returns empty body unchanged", () => {
    const result = splitPlaintextQuote("");
    expect(result.body).toBe("");
    expect(result.quote).toBeNull();
  });

  it("handles nested quoted chain correctly (real Gmail example)", () => {
    const text = [
      "hiii :))",
      "",
      "",
      "---",
      "On 19/05/2026, 19:23:11, vanwesteropbroan@gmail.com wrote:",
      "1351356",
      "",
      "On Tue, 19 May 2026 at 17:52, <testingproduction15@solace.onl> wrote:",
      "> hello!",
    ].join("\n");

    const result = splitPlaintextQuote(text);
    expect(result.body.trim()).toBe("hiii :))");
    expect(result.quote).not.toBeNull();
  });
});

describe("splitHtmlQuote", () => {

  it("returns html unchanged when no quote markers present", () => {
    const html = "<p>Hello world</p>";
    const result = splitHtmlQuote(html);
    expect(result.html).toBe(html);
    expect(result.hasQuote).toBe(false);
  });

  it("detects gmail_quote class", () => {
    const html = `<p>New message</p><div class="gmail_quote"><p>Old quoted message</p></div>`;
    const result = splitHtmlQuote(html);
    expect(result.hasQuote).toBe(true);
    // The stripped version should not contain the gmail_quote div
    expect(result.html).not.toContain("gmail_quote");
  });

  it("detects blockquote[type=cite]", () => {
    const html = `<p>Reply text</p><blockquote type="cite"><p>Original</p></blockquote>`;
    const result = splitHtmlQuote(html);
    expect(result.hasQuote).toBe(true);
    expect(result.html).not.toContain('blockquote type="cite"');
  });

  it("does not strip when stripped body would be empty", () => {
    // Edge case: if ALL content is in a gmail_quote, return unsplit
    const html = `<div class="gmail_quote"><p>Everything</p></div>`;
    const result = splitHtmlQuote(html);
    // hasQuote should be false because stripping leaves empty body
    expect(result.hasQuote).toBe(false);
    expect(result.html).toBe(html);
  });

  it("detects gmail_extra class", () => {
    const html = `<p>Hi!</p><div class="gmail_extra">On date, person wrote:<br /><blockquote>...</blockquote></div>`;
    const result = splitHtmlQuote(html);
    expect(result.hasQuote).toBe(true);
    expect(result.html).not.toContain("gmail_extra");
  });
});
