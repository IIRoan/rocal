import {
  assertMailMimeLimits,
  fitsMailUtf8ByteLimit,
  getMailReadLimitNotice,
  limitMailDisplayContent,
  limitMailQuoteContent,
  getMailDraftSizeError,
  MAX_MAIL_DISPLAY_CHARACTERS,
  MAX_MAIL_DISPLAY_HTML_CHARACTERS,
  MAX_MAIL_MIME_BYTES,
  MAX_MAIL_MIME_LINES,
  MAX_MAIL_MIME_HEADER_BYTES,
  MAX_MAIL_MIME_DEPTH,
  MAX_MAIL_MIME_PARTS,
} from "../mail-mime-limits";

it("keeps resource refusals recognizable across worker serialization without exposing other errors", () => {
  expect(
    getMailReadLimitNotice(
      new Error("This message has too many lines to open here."),
    ),
  ).toBe("This message has too many lines to open here.");
  expect(
    getMailReadLimitNotice(new Error("Mail MIME exceeds the size limit.")),
  ).toBe("This message is too large or complex to open here.");
  expect(
    getMailReadLimitNotice(new Error("Sensitive upstream error")),
  ).toBeNull();
  expect(
    getMailReadLimitNotice({ message: "Mail MIME exceeds the size limit." }),
  ).toBeNull();
});

it("maps library resource refusals and accepts bounded punctuation in MIME boundaries", () => {
  expect(
    getMailReadLimitNotice(
      new Error("Maximum MIME nesting depth of 20 levels exceeded"),
    ),
  ).toContain("too large or complex");
  expect(
    getMailReadLimitNotice(
      new Error("Maximum header size of 65536 bytes exceeded"),
    ),
  ).toContain("too large or complex");
  expect(() =>
    assertMailMimeLimits(
      'Content-Type: multipart/mixed; boundary="a*!#@{}[]"\n\n--a*!#@{}[]\nContent-Type: text/plain\n\nHello\n--a*!#@{}[]--',
    ),
  ).not.toThrow();
});

it("bounds display and quoted text without splitting code points or rendering partial HTML", () => {
  const text = "a".repeat(MAX_MAIL_DISPLAY_CHARACTERS - 1) + "🙂tail";
  const display = limitMailDisplayContent({ text, html: "<p>short</p>" });
  expect(display.html).toBe("<p>short</p>");
  expect(display.text).toBe(
    "a".repeat(MAX_MAIL_DISPLAY_CHARACTERS - 1) +
      "\n\nThis message is too large to show in full here.",
  );
  expect(limitMailQuoteContent({ text }).text).toContain(
    "[Earlier message shortened.]",
  );
  const html = "<style>" + "x".repeat(MAX_MAIL_DISPLAY_HTML_CHARACTERS);
  expect(limitMailDisplayContent({ html })).toEqual({
    html: null,
    text: "This message is too large to show in full here.",
  });
  expect(getMailDraftSizeError({ text })).toContain(
    "saved draft has not been changed",
  );
  expect(
    getMailDraftSizeError({ text: "a".repeat(MAX_MAIL_DISPLAY_CHARACTERS) }),
  ).toBeNull();
});

function nested(depth: number): string {
  let body = "Content-Type: text/plain\r\n\r\nReadable body";
  for (let i = 0; i < depth; i += 1)
    body = `Content-Type: multipart/mixed; boundary=b${i}\r\n\r\n--b${i}\r\n${body}\r\n--b${i}--`;
  return body;
}

it("accepts ordinary MIME and the exact nesting boundary", () => {
  expect(() => assertMailMimeLimits(nested(MAX_MAIL_MIME_DEPTH))).not.toThrow();
  expect(() => assertMailMimeLimits(nested(MAX_MAIL_MIME_DEPTH + 1))).toThrow(
    "structural limit",
  );
});

it("counts empty MIME parts before either parser can allocate them", () => {
  const part = "--many\nContent-Type: text/plain\n\nbody\n";
  const header = "Content-Type: multipart/mixed; boundary=many\n\n";
  expect(() =>
    assertMailMimeLimits(
      header + part.repeat(MAX_MAIL_MIME_PARTS - 1) + "--many--",
    ),
  ).not.toThrow();
  expect(() =>
    assertMailMimeLimits(
      header + part.repeat(MAX_MAIL_MIME_PARTS) + "--many--",
    ),
  ).toThrow("structural limit");
});

it("bounds total content and UTF8 header bytes", () => {
  expect(() =>
    assertMailMimeLimits("x".repeat(MAX_MAIL_MIME_BYTES + 1)),
  ).toThrow("size limit");
  expect(() =>
    assertMailMimeLimits(
      `Subject: ${"é".repeat(MAX_MAIL_MIME_HEADER_BYTES / 2)}\n\nbody`,
    ),
  ).toThrow("headers");
});

it("refuses duplicate types and ambiguous boundary parameters", () => {
  expect(() =>
    assertMailMimeLimits(
      "Content-Type: text/plain\nContent-Type: text/html\n\nbody",
    ),
  ).toThrow("ambiguous");
  expect(() =>
    assertMailMimeLimits(
      'Content-Type: multipart/mixed; boundary=a; boundary="b"\n\n--a--',
    ),
  ).toThrow("boundary");
});

it("cannot bypass structural limits with permissive native header whitespace", () => {
  const hostile = nested(MAX_MAIL_MIME_DEPTH + 1).replace(
    /Content-Type:/g,
    " Content-Type :",
  );
  expect(() => assertMailMimeLimits(hostile)).toThrow("structural limit");
});

it("counts UTF8 at exact boundaries without changing surrogate semantics", () => {
  for (const value of [
    "ASCII",
    "café",
    "中文",
    "🙂",
    "\ud800",
    "\udc00",
    "a🙂é",
  ]) {
    const length = new TextEncoder().encode(value).byteLength;
    expect(fitsMailUtf8ByteLimit(value, length)).toBe(true);
    expect(fitsMailUtf8ByteLimit(value, length - 1)).toBe(false);
  }
});

it("rejects a newline flood before a line-retaining MIME decoder handles it", () => {
  expect(() =>
    assertMailMimeLimits(
      "Content-Type: text/plain\n\n" + "\n".repeat(MAX_MAIL_MIME_LINES),
    ),
  ).toThrow("too many lines");
});

it("keeps ordinary pasted-image drafts readable without treating embedded base64 as plain text", () => {
  const html =
    '<p>Screenshot</p><img src="data:image/png;base64,' +
    "A".repeat(1_400_000) +
    '">';
  const text = "Content-Type: text/html\r\n\r\n" + html;
  expect(getMailDraftSizeError({ text: "Screenshot", html })).toBeNull();
  expect(getMailDraftSizeError({ text, html })).toContain("too large to edit");
  expect(getMailDraftSizeError({ text: null, html })).toBeNull();
  expect(limitMailDisplayContent({ text: "Screenshot", html }).html).toBe(html);
});
