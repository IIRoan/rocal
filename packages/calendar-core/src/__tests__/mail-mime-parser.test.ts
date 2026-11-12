import {
  MAX_MAIL_DISPLAY_CHARACTERS,
  MAX_MAIL_DISPLAY_HTML_CHARACTERS,
  MAX_MAIL_MIME_LINES,
} from "../mail-mime-limits";
import {
  extractNestedPgpMimeCiphertext,
  MAIL_DRAFT_TEXT_LIMITS,
  parseDecryptedMailContent,
  parseMailMimeContent,
} from "../mail-mime-parser";
import { buildOutgoingMimeMessage } from "../outgoing-mime";

function base64(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function leaf(headers: string[], body: string): string {
  return [...headers, "", body].join("\r\n");
}

function multipart(type: string, boundary: string, parts: string[]): string {
  return [
    `Content-Type: multipart/${type}; boundary="${boundary}"`,
    "",
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function plain(body: string, extra: string[] = []): string {
  return leaf(["Content-Type: text/plain; charset=utf-8", ...extra], body);
}

function html(body: string, extra: string[] = []): string {
  return leaf(["Content-Type: text/html; charset=utf-8", ...extra], body);
}

function attachment(name: string, body: string): string {
  return leaf(
    [
      `Content-Type: application/octet-stream; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
    ],
    base64(body),
  );
}

function read(raw: string) {
  const parsed = parseMailMimeContent(raw);
  return {
    text: parsed.text,
    html: parsed.html,
    truncated: parsed.truncated,
    attachments: parsed.attachments.map((entry) => ({
      filename: entry.filename,
      mimeType: entry.mimeType,
      content: new TextDecoder().decode(entry.content),
    })),
  };
}

const QP = ["Content-Transfer-Encoding: quoted-printable"];
const B64 = ["Content-Transfer-Encoding: base64"];
const alternative = multipart("alternative", "a", [
  plain("P body"),
  html("<p>H body</p>"),
]);

// Expected values are what postal-mime 2.7.4 returned for the same input before it was replaced.
describe("parity with the MIME reader this parser replaced", () => {
  it.each<[string, string, { text: string | null; html: string | null }]>([
    [
      "a single plain part",
      plain("Hello\r\nworld"),
      { text: "Hello\nworld", html: null },
    ],
    [
      "a body without a content type",
      "Subject: x\r\n\r\nBody here",
      { text: "Body here", html: null },
    ],
    [
      "an alternative pair",
      alternative,
      { text: "P body", html: "<p>H body</p>" },
    ],
    [
      "HTML alone",
      html("<p>only html</p>"),
      { text: null, html: "<p>only html</p>" },
    ],
    ["an empty root text part", plain(""), { text: null, html: null }],
    [
      "an empty nested text part",
      multipart("mixed", "m", [plain(""), attachment("x.bin", "x")]),
      { text: "", html: null },
    ],
    [
      "two plain parts around an attachment",
      multipart("mixed", "m", [
        plain("first"),
        attachment("x.bin", "x"),
        plain("second"),
      ]),
      { text: "first\n\nsecond", html: null },
    ],
    [
      "quoted-printable UTF-8 with a soft break",
      plain("caf=C3=A9 =E2=82=AC soft=\r\nbreak\r\nnext line", QP),
      { text: "café € softbreak\nnext line", html: null },
    ],
    [
      "quoted-printable Latin-1",
      leaf(
        ["Content-Type: text/plain; charset=iso-8859-1", ...QP],
        "caf=E9 na=EFve",
      ),
      { text: "café naïve", html: null },
    ],
    [
      "base64 text",
      plain(base64("base64 body ✓\nline two"), B64),
      { text: "base64 body ✓\nline two", html: null },
    ],
    [
      "base64 Windows-1252 HTML",
      leaf(
        ["Content-Type: text/html; charset=windows-1252", ...B64],
        base64(
          new Uint8Array([
            0x3c, 0x70, 0x3e, 0x80, 0xe9, 0x3c, 0x2f, 0x70, 0x3e,
          ]),
        ),
      ),
      { text: null, html: "<p>€é</p>" },
    ],
    [
      "format=flowed text",
      leaf(
        ["Content-Type: text/plain; charset=utf-8; format=flowed"],
        "This is a long \r\nparagraph that \r\ncontinues.\r\n\r\n> quoted \r\n> text\r\n stuffed\r\n-- \r\nSig line",
      ),
      {
        text: "This is a long paragraph that continues.\n\n> quoted > text\nstuffed\n-- \nSig line",
        html: null,
      },
    ],
    [
      "format=flowed with delsp",
      leaf(
        ["Content-Type: text/plain; charset=utf-8; format=flowed; delsp=yes"],
        "Word1 \r\nWord2  \r\nWord3\r\n",
      ),
      { text: "Word1Word2 Word3", html: null },
    ],
    [
      "bare line feeds",
      alternative.replace(/\r\n/g, "\n"),
      { text: "P body", html: "<p>H body</p>" },
    ],
    [
      "a protected-headers part beside the body",
      multipart("mixed", "m", [
        leaf(
          [
            'Content-Type: text/rfc822-headers; protected-headers="v1"',
            "Content-Disposition: inline",
          ],
          "Subject: secret",
        ),
        plain("real body"),
      ]),
      { text: "real body", html: null },
    ],
    [
      "an inline calendar part",
      multipart("mixed", "m", [
        plain("invite"),
        leaf(
          ["Content-Type: text/calendar; method=REQUEST; charset=utf-8"],
          "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
        ),
      ]),
      { text: "invite", html: null },
    ],
  ])("reads %s", (_name, raw, expected) => {
    const parsed = read(raw);
    expect({ text: parsed.text, html: parsed.html }).toEqual(expected);
    expect(parsed.truncated).toBe(false);
  });

  it("keeps a plain part that follows an alternative pair in both bodies", () => {
    const parsed = read(
      multipart("mixed", "m", [alternative, plain("footer <tag> & more")]),
    );
    expect(parsed.text).toBe("P body\n\nfooter <tag> & more");
    expect(parsed.html).toBe(
      "<p>H body</p>\n\n<div>footer &lt;tag&gt; &amp; more</div>",
    );
  });

  it("keeps an HTML part that follows an alternative pair in both bodies", () => {
    const parsed = read(
      multipart("mixed", "m", [
        alternative,
        html("<p>html <b>footer</b> &amp; more</p>"),
      ]),
    );
    expect(parsed.text).toBe("P body\n\n\nhtml footer & more");
    expect(parsed.html).toBe(
      "<p>H body</p>\n\n<p>html <b>footer</b> &amp; more</p>",
    );
  });

  it("converts each way when plain and HTML parts are siblings instead of alternatives", () => {
    const parsed = read(
      multipart("mixed", "m", [
        plain("plain first"),
        html("<div>html second</div>"),
      ]),
    );
    expect(parsed.text).toBe("plain first\n\n\nhtml second");
    expect(parsed.html).toBe("<div>plain first</div>\n<div>html second</div>");
  });

  it("reads the body and attachments of nested alternative, related and mixed parts", () => {
    const parsed = read(
      multipart("mixed", "m", [
        multipart("related", "r", [
          multipart("alternative", "a", [
            plain("deep plain"),
            html("<p>deep html</p>"),
          ]),
          leaf(["Content-Type: image/png", "Content-ID: <x>", ...B64], "AAAA"),
        ]),
        attachment("a.txt", "one"),
        attachment("b.txt", "two"),
      ]),
    );
    expect(parsed).toEqual({
      text: "deep plain",
      html: "<p>deep html</p>",
      truncated: false,
      attachments: [
        {
          filename: "a.txt",
          mimeType: "application/octet-stream",
          content: "one",
        },
        {
          filename: "b.txt",
          mimeType: "application/octet-stream",
          content: "two",
        },
      ],
    });
  });

  it.each([
    [
      "an RFC 2231 extended value",
      [
        "Content-Disposition: attachment;\r\n filename*=UTF-8''%E2%82%AC%20rates.pdf",
      ],
      "€ rates.pdf",
    ],
    [
      "RFC 2231 continuations",
      [
        "Content-Disposition: attachment;\r\n filename*0*=UTF-8''%E2%82%AC%20very;\r\n filename*1*=%20long;\r\n filename*2=\" name.pdf\"",
      ],
      "€ very longname.pdf",
    ],
    [
      "RFC 2047 encoded words",
      [
        'Content-Disposition: attachment; filename="=?UTF-8?Q?=E2=82=AC_rates.pdf?="',
      ],
      "€ rates.pdf",
    ],
    [
      "encoded words that split one character",
      [
        'Content-Disposition: attachment; filename="=?UTF-8?B?4oI=?= =?UTF-8?B?rC5wZGY=?="',
      ],
      "€.pdf",
    ],
    [
      "a quoted name holding a semicolon",
      ['Content-Disposition: attachment; filename="naïve ;file.pdf"'],
      "naïve ;file.pdf",
    ],
    [
      "the content-type name when the disposition has none",
      ["Content-Disposition: attachment"],
      "fallback.pdf",
    ],
  ])("names an attachment from %s", (_name, headers, filename) => {
    const parsed = read(
      multipart("mixed", "m", [
        plain("x"),
        leaf(
          [
            'Content-Type: application/pdf; name="fallback.pdf"',
            ...headers,
            ...B64,
          ],
          base64("pdf"),
        ),
      ]),
    );
    expect(parsed.attachments).toEqual([
      { filename, mimeType: "application/pdf", content: "pdf" },
    ]);
  });

  it("lists an attachment inside multipart/related only when the HTML cannot reference it", () => {
    const image = (headers: string[]) =>
      multipart("related", "r", [
        html('<img src="cid:logo">'),
        leaf(
          ['Content-Type: image/png; name="logo.png"', ...headers, ...B64],
          "iVBORw0KGgo=",
        ),
      ]);
    expect(
      read(
        image([
          "Content-Disposition: inline; filename=logo.png",
          "Content-ID: <logo>",
        ]),
      ).attachments,
    ).toEqual([]);
    expect(
      read(
        image([
          "Content-Disposition: attachment; filename=logo.png",
          "Content-ID: <logo>",
        ]),
      ).attachments,
    ).toEqual([]);
    expect(
      read(image(["Content-Disposition: attachment; filename=logo.png"]))
        .attachments,
    ).toHaveLength(1);
  });

  it("ignores a part with a filename but no attachment disposition", () => {
    const parsed = read(
      multipart("mixed", "m", [
        leaf(
          [
            'Content-Type: image/png; name="inline.png"',
            "Content-Disposition: inline",
            ...B64,
          ],
          "iVBORw0KGgo=",
        ),
      ]),
    );
    expect(parsed.attachments).toEqual([]);
  });

  it("returns identity and quoted-printable attachments byte for byte, without an added line break", () => {
    const parsed = read(
      multipart("mixed", "m", [
        plain("body"),
        leaf(
          [
            "Content-Type: text/plain; name=notes.txt",
            "Content-Disposition: attachment; filename=notes.txt",
          ],
          "attached notes\r\nline2",
        ),
        leaf(
          [
            "Content-Type: text/csv; name=a.csv",
            "Content-Disposition: attachment; filename=a.csv",
            ...QP,
          ],
          "a;b=3Bc=\r\n;d\r\ncaf=C3=A9",
        ),
        leaf(
          [
            "Content-Type: message/rfc822",
            "Content-Disposition: attachment; filename=orig.eml",
          ],
          "Subject: inner\r\n\r\ninner body",
        ),
      ]),
    );
    expect(parsed.text).toBe("body");
    expect(parsed.attachments).toEqual([
      {
        filename: "notes.txt",
        mimeType: "text/plain",
        content: "attached notes\nline2",
      },
      { filename: "a.csv", mimeType: "text/csv", content: "a;b;c;d\ncafé" },
      {
        filename: "orig.eml",
        mimeType: "message/rfc822",
        content: "Subject: inner\n\ninner body",
      },
    ]);
  });

  it("reads what the app itself sends, including an attachment-only message", () => {
    expect(
      read(
        buildOutgoingMimeMessage({
          text: "Hello world",
          html: "<p>Hello <strong>world</strong></p>",
        }),
      ),
    ).toEqual({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p>",
      truncated: false,
      attachments: [],
    });
    const sent = read(
      buildOutgoingMimeMessage({
        text: "",
        html: '<img src="cid:i1">',
        attachments: [
          {
            filename: "i.png",
            contentType: "image/png",
            content: new Uint8Array([1, 2, 3]),
            cid: "i1",
            disposition: "inline",
          },
          {
            filename: "a.txt",
            contentType: "text/plain",
            content: new TextEncoder().encode("hi"),
          },
        ],
      }),
    );
    expect(sent.text).toBe("");
    expect(sent.html).toBe('<img src="cid:i1">');
    expect(sent.attachments).toEqual([
      { filename: "a.txt", mimeType: "text/plain", content: "hi" },
    ]);
  });
});

// An HTML part is turned into text only when the message also has plain parts; expected values are postal-mime 2.7.4 output.
describe("an HTML part read as text beside a plain part", () => {
  const beside = (body: string) =>
    parseMailMimeContent(multipart("mixed", "m", [plain("intro"), html(body)]));

  it.each([
    [
      "a quoted link target",
      '<p>See <a href="https://example.test/a?b=1&amp;c=2">the report</a> today.</p>',
      "intro\n\n\nSee (https://example.test/a?b=1&c=2) the report today.",
    ],
    [
      "a single-quoted link target",
      "<p>Open <a class='x' href='https://example.test/path'>this</a></p>",
      "intro\n\n\nOpen (https://example.test/path) this",
    ],
    [
      "a link target among other attributes",
      '<a target="_blank" rel="noopener" href="mailto:ann@example.test" style="color:red">Mail Ann</a>',
      "intro\n\n (mailto:ann@example.test) Mail Ann",
    ],
    [
      "an anchor without a target",
      '<p><a name="top">Top</a> of page</p>',
      "intro\n\n\nTop of page",
    ],
    [
      "two links",
      '<div><a href="https://a.test">A</a> and <a href="https://b.test">B</a></div>',
      "intro\n\n\n (https://a.test) A and (https://b.test) B",
    ],
    [
      "an unordered list",
      "<ul>\r\n  <li>First item</li>\r\n  <li>Second <b>bold</b> item</li>\r\n</ul>",
      "intro\n\n\n * First item \n * Second bold item",
    ],
    [
      "an ordered list",
      "<ol><li>One</li><li>Two</li><li>Three</li></ol>",
      "intro\n\n * One * Two * Three",
    ],
    [
      "a nested list",
      "<ul><li>Outer<ul><li>Inner one</li><li>Inner two</li></ul></li><li>Last</li></ul>",
      "intro\n\n * Outer * Inner one * Inner two * Last",
    ],
    [
      "a list of links",
      '<ul><li><a href="https://one.test">One</a></li><li><a href="https://two.test">Two</a></li></ul>',
      "intro\n\n * (https://one.test) One * (https://two.test) Two",
    ],
    [
      "a rule",
      "<p>Above</p><hr><p>Below</p>",
      "intro\n\n\nAbove\n\n-------------\n\nBelow",
    ],
    [
      "line breaks",
      "Line one<br>Line two<br/>Line three<BR />Line four",
      "intro\n\nLine one\nLine two\nLine three\nLine four",
    ],
    [
      "paragraphs and blocks",
      "<div>Block one</div><div>Block two</div><p>Para</p>",
      "intro\n\n\nBlock one\n\nBlock two\n\nPara",
    ],
    [
      "a table",
      "<table><tr><th>Name</th><th>Qty</th></tr><tr><td>Bolts</td><td>12</td></tr></table>",
      "intro\n\n\nName\n\nQty\n\nBolts\n\n12",
    ],
    [
      "a comment",
      "<p>Visible<!-- hidden <b>note</b> --> text</p>",
      "intro\n\n\nVisible text",
    ],
    [
      "a script",
      "<p>Before</p><script>alert('x < y');</script><p>After</p>",
      "intro\n\n\nBefore\n\nAfter",
    ],
    [
      "inline formatting",
      "<p>Some <em>emphasis</em>, <strong>strong</strong>, <u>under</u> and <span style='x'>span</span>.</p>",
      "intro\n\n\nSome emphasis, strong, under and span.",
    ],
    [
      "basic entities",
      "<p>Tom &amp; Jerry &lt;tj@example.test&gt; said &quot;hi&quot;&nbsp;there</p>",
      'intro\n\n\nTom & Jerry <tj@example.test> said "hi"\u00a0there',
    ],
    [
      "Latin-1 entities",
      "<p>Caf&eacute; cr&egrave;me, &Uuml;ber, na&iuml;ve, &copy; 2026, 5&deg;, &frac12;, &laquo;oui&raquo;</p>",
      "intro\n\n\nCafé crème, Über, naïve, © 2026, 5°, ½, «oui»",
    ],
    [
      "typographic entities",
      "<p>&ldquo;Quote&rdquo; &mdash; it&rsquo;s &euro;5 &hellip; &bull; done &trade;</p>",
      "intro\n\n\n“Quote” — it’s €5 … • done ™",
    ],
    [
      "numeric entities",
      "<p>&#8364;10 and &#x20AC;20 and &#128578;</p>",
      "intro\n\n\n€10 and €20 and 🙂",
    ],
    [
      "an escaped ampersand before an entity name",
      "<p>Write &amp;eacute; for an accent</p>",
      "intro\n\n\nWrite &eacute; for an accent",
    ],
    [
      "an unknown entity",
      "<p>Keep &notanentity; as is</p>",
      "intro\n\n\nKeep &notanentity; as is",
    ],
    [
      "a whole document",
      '<!DOCTYPE html>\r\n<html><head><title>T</title><style>p{color:red}</style></head>\r\n<body bgcolor="#fff">\r\n<p>Hello <a href="https://example.test">world</a></p>\r\n<ul><li>a</li><li>b</li></ul>\r\n</body></html>',
      "intro\n\n\nHello (https://example.test) world\n\n * a * b",
    ],
    [
      "uppercase tags",
      '<P>Upper <A HREF="https://upper.test">link</A></P><UL><LI>Item</LI></UL>',
      "intro\n\n\nUpper (https://upper.test) link\n\n * Item",
    ],
    [
      "runs of whitespace",
      "<p>Many     spaces\tand\ttabs</p>\r\n\r\n\r\n<p>Next</p>",
      "intro\n\n\nMany spaces and tabs\n\nNext",
    ],
    [
      "images and unknown tags",
      '<p>Logo <img src="cid:logo" alt="Logo"> and <custom-tag>custom</custom-tag></p>',
      "intro\n\n\nLogo and custom",
    ],
    [
      "a signature block",
      '<div>Regards,</div><div>Ann</div><div><a href="https://solace.test">solace.test</a></div>',
      "intro\n\n\nRegards,\n\nAnn\n\n (https://solace.test) solace.test",
    ],
  ])("keeps %s", (_name, body, expected) => {
    expect(beside(body).text).toBe(expected);
  });

  it("keeps an unquoted link target apart from the link text, which the replaced reader ran together", () => {
    expect(
      beside("<p>Go <a href=https://example.test/u>here</a> now</p>").text,
    ).toBe("intro\n\n\nGo (https://example.test/u) here now");
  });

  it("counts converted text against the text limit and reports what it cut", () => {
    const parsed = parseMailMimeContent(
      multipart("mixed", "m", [
        plain("intro"),
        html(
          "<ul>" +
            '<li><a href="https://example.test/x">item</a></li>'.repeat(2000) +
            "</ul>",
        ),
      ]),
      { text: 1000, html: 200_000 },
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.text?.length).toBeLessThanOrEqual(1000);
    expect(
      parsed.text?.startsWith("intro\n\n * (https://example.test/x) item * ("),
    ).toBe(true);
  });

  it.each([
    ["unclosed anchors", "<a ".repeat(300_000)],
    ["unclosed comments", "<!-- ".repeat(200_000)],
    ["unclosed scripts", "<script ".repeat(120_000)],
    ["list items with blank runs", ("<li>" + " ".repeat(40)).repeat(20_000)],
    [
      "anchors whose target never comes",
      ("<a href" + " ".repeat(30) + ">").repeat(20_000),
    ],
  ])("converts hostile %s in linear time", (_name, body) => {
    const started = Date.now();
    expect(beside(body).text?.startsWith("intro")).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("decoding", () => {
  it("decodes quoted-printable UTF-8, literal Unicode and soft line breaks together", () => {
    expect(
      parseMailMimeContent(
        "Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: quoted-printable\n\ncafé =E2=82=AC =E2=\n=82=AC",
      ).text,
    ).toBe("café € €");
  });

  it("decodes quoted-printable attachment bytes without stringifying them", () => {
    expect(
      parseMailMimeContent(
        "Content-Type: application/octet-stream\nContent-Disposition: attachment; filename=test.bin\nContent-Transfer-Encoding: quoted-printable\n\n=00=FF=41=\nZ",
      ).attachments[0]?.content,
    ).toEqual(new Uint8Array([0, 255, 65, 90]));
  });

  it("keeps attached messages as opaque files instead of parsing them recursively", () => {
    let message = "Content-Type: text/plain\n\nHello";
    for (let depth = 0; depth < 22; depth += 1)
      message = "Content-Type: message/rfc822\n\n" + message;
    const parsed = parseMailMimeContent(message);
    expect(parsed.text).toBeNull();
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]?.filename).toBe("message.eml");
    expect(parsed.attachments[0]?.mimeType).toBe("message/rfc822");
  });

  it("preserves UTF-8 bytes in an 8bit attached message", () => {
    const inner =
      "Subject: café 中文\nContent-Type: text/plain; charset=utf-8\n\n🙂";
    expect(
      parseMailMimeContent(
        "Content-Type: message/rfc822\nContent-Transfer-Encoding: 8bit\n\n" +
          inner,
      ).attachments[0]?.content,
    ).toEqual(new TextEncoder().encode(inner));
  });

  it("keeps a base64 attached message opaque even when its decoded lines exceed the scanner cap", () => {
    const inner =
      "Content-Type: text/plain\n\n" + "\n".repeat(MAX_MAIL_MIME_LINES + 1);
    const encoded = base64(inner)
      .match(/.{1,76}/g)
      ?.join("\n");
    const parsed = parseMailMimeContent(
      "Content-Type: message/rfc822\nContent-Transfer-Encoding: base64\n\n" +
        encoded,
    );
    expect(parsed.text).toBeNull();
    expect(parsed.attachments[0]?.content).toEqual(
      new TextEncoder().encode(inner),
    );
  });

  it("reads a boundary made of unusual but bounded punctuation", () => {
    expect(
      parseMailMimeContent(
        'Content-Type: multipart/mixed; boundary="a*!#@{}[]"\n\n--a*!#@{}[]\nContent-Type: text/plain\n\nHello\n--a*!#@{}[]--',
      ).text,
    ).toBe("Hello");
  });

  it("refuses line-dense MIME with a readable notice", () => {
    expect(() =>
      parseDecryptedMailContent(
        "Content-Type: text/plain\n\n" + "\n".repeat(MAX_MAIL_MIME_LINES),
      ),
    ).toThrow("This message has too many lines to open here.");
  });
});

describe("bounded decoding", () => {
  const limits = { text: 1000, html: 4000 };

  it("stops decoding quoted-printable text at the read limit instead of decoding it all first", () => {
    const decode = jest.spyOn(TextDecoder.prototype, "decode");
    const row = "abc=20".repeat(12) + "=\r\n";
    const parsed = parseMailMimeContent(plain(row.repeat(80_000), QP));
    const largest = Math.max(
      ...decode.mock.calls.map(([input]) =>
        input instanceof Uint8Array ? input.byteLength : 0,
      ),
    );
    decode.mockRestore();
    expect(largest).toBeLessThanOrEqual(MAX_MAIL_DISPLAY_CHARACTERS * 3 + 3);
    expect(parsed.truncated).toBe(true);
    expect(
      parsed.text === "abc ".repeat(MAX_MAIL_DISPLAY_CHARACTERS / 4).trim(),
    ).toBe(true);
  });

  it("reads only as much base64 text as the limit needs", () => {
    const decodeBase64 = jest.spyOn(globalThis, "atob");
    const encoded =
      base64("0123456789".repeat(20_000))
        .match(/.{1,76}/g)
        ?.join("\r\n") ?? "";
    const parsed = parseMailMimeContent(plain(encoded, B64), limits);
    const largest = Math.max(
      ...decodeBase64.mock.calls.map(([input]) => input.length),
    );
    decodeBase64.mockRestore();
    expect(largest).toBeLessThanOrEqual(
      Math.ceil((limits.text * 3 + 3) / 3) * 4,
    );
    expect(parsed).toMatchObject({
      text: "0123456789".repeat(100),
      truncated: true,
    });
  });

  it("clips identity text, including a line-dense body, and reports it", () => {
    const parsed = parseMailMimeContent(
      plain("012345678901234567890123\r\n".repeat(200_000)),
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.text?.length).toBeLessThanOrEqual(
      MAX_MAIL_DISPLAY_CHARACTERS,
    );
    expect(parsed.text?.startsWith("012345678901234567890123\n0123")).toBe(
      true,
    );
  });

  it("leaves text of exactly the limit complete and unflagged", () => {
    const parsed = parseMailMimeContent(plain("x".repeat(limits.text)), limits);
    expect(parsed).toMatchObject({
      text: "x".repeat(limits.text),
      truncated: false,
    });
    expect(
      parseMailMimeContent(plain("x".repeat(limits.text + 1)), limits),
    ).toMatchObject({ text: "x".repeat(limits.text), truncated: true });
  });

  it("never ends clipped text inside a surrogate pair", () => {
    const parsed = parseMailMimeContent(
      plain("a".repeat(limits.text - 1) + "🙂tail"),
      limits,
    );
    expect(parsed.text).toBe("a".repeat(limits.text - 1));
    expect(parsed.truncated).toBe(true);
  });

  it("shares one text budget across several text parts", () => {
    const parsed = parseMailMimeContent(
      multipart("mixed", "m", [
        plain("a".repeat(600)),
        plain("b".repeat(600)),
        plain("c".repeat(600)),
      ]),
      limits,
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.text?.length).toBeLessThanOrEqual(limits.text);
    expect(parsed.text?.startsWith("a".repeat(600) + "\n\n" + "b")).toBe(true);
    expect(parsed.text).not.toContain("c");
  });

  it("drops HTML past its limit, keeps the text and reports the loss", () => {
    const raw = multipart("alternative", "a", [
      plain("short text"),
      html("<p>" + "x".repeat(limits.html) + "</p>"),
    ]);
    expect(parseMailMimeContent(raw, limits)).toMatchObject({
      text: "short text",
      html: null,
      truncated: true,
    });
  });

  it("keeps the whole HTML of a draft, whose images may be embedded in it", () => {
    const body =
      '<p>Screenshot</p><img src="data:image/png;base64,' +
      "A".repeat(MAX_MAIL_DISPLAY_HTML_CHARACTERS) +
      '">';
    const raw = multipart("alternative", "a", [
      plain("Screenshot"),
      html(body),
    ]);
    expect(parseMailMimeContent(raw)).toMatchObject({
      html: null,
      truncated: true,
    });
    expect(parseMailMimeContent(raw, MAIL_DRAFT_TEXT_LIMITS)).toMatchObject({
      text: "Screenshot",
      html: body,
      truncated: false,
    });
  });

  it("decodes attachments whole whatever the text limits are", () => {
    const bytes = new Uint8Array(3_000_000).map((_, index) => index % 251);
    const rows = "row,of,short,cells\r\n".repeat(150_000);
    const quoted = "abc=20".repeat(12) + "=\r\n";
    const parsed = parseMailMimeContent(
      multipart("mixed", "m", [
        plain("body"),
        leaf(
          [
            "Content-Type: application/octet-stream",
            "Content-Disposition: attachment; filename=big.bin",
            ...B64,
          ],
          base64(bytes)
            .match(/.{1,76}/g)
            ?.join("\r\n") ?? "",
        ),
        leaf(
          [
            "Content-Type: text/csv",
            "Content-Disposition: attachment; filename=rows.csv",
          ],
          rows,
        ),
        leaf(
          [
            "Content-Type: text/plain",
            "Content-Disposition: attachment; filename=quoted.txt",
            ...QP,
          ],
          quoted.repeat(40_000),
        ),
      ]),
      { text: 10, html: 10 },
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.text).toBe("body");
    expect(parsed.attachments[0]?.content).toEqual(bytes);
    expect(parsed.attachments[1]?.content.byteLength).toBe(
      rows.replace(/\r\n/g, "\n").length,
    );
    expect(parsed.attachments[2]?.content.byteLength).toBe(48 * 40_000);
  });

  it("clips a payload that is not MIME and reports it", () => {
    expect(parseDecryptedMailContent("Hello plain text")).toEqual({
      text: "Hello plain text",
      html: null,
      attachments: [],
      truncated: false,
    });
    const long = parseDecryptedMailContent(
      "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS + 5),
    );
    expect(long.text).toHaveLength(MAX_MAIL_DISPLAY_CHARACTERS);
    expect(long.truncated).toBe(true);
  });
});

describe("named entities in mixed MIME bodies", () => {
  it("preserves Greek, mathematical, multi-code-point and legacy named references", () => {
    const parsed = parseMailMimeContent(
      multipart("mixed", "entities", [
        plain("intro"),
        html(
          "<p>&Alpha; &alpha; &sum; &NotEqualTilde; &frac12 &Afr; &amp;Alpha;</p>",
        ),
      ]),
    );
    expect(parsed.text).toBe("intro\n\n\nΑ α ∑ ≂̸ ½ 𝔄 &Alpha;");
  });
});

describe("extractNestedPgpMimeCiphertext", () => {
  const armored =
    "-----BEGIN PGP MESSAGE-----\r\n\r\nwcBMA0SYNTHETIC\r\n-----END PGP MESSAGE-----";
  const envelope = (parts: string[]) =>
    [
      'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="e"',
      "",
      ...parts.flatMap((part) => ["--e", part]),
      "--e--",
      "",
    ].join("\r\n");
  const control = leaf(
    ["Content-Type: application/pgp-encrypted"],
    "Version: 1",
  );
  const payload = leaf(["Content-Type: application/octet-stream"], armored);

  it("returns the inner armored message of an RFC 3156 envelope", () => {
    expect(extractNestedPgpMimeCiphertext(envelope([control, payload]))).toBe(
      armored.replace(/\r\n/g, "\n"),
    );
    expect(extractNestedPgpMimeCiphertext(plain("not an envelope"))).toBeNull();
  });

  it("decodes a transfer-encoded payload in full", () => {
    const encoded = leaf(
      ["Content-Type: application/octet-stream", ...B64],
      base64(armored),
    );
    expect(extractNestedPgpMimeCiphertext(envelope([control, encoded]))).toBe(
      armored,
    );
  });

  it("refuses an envelope with extra or nested parts", () => {
    expect(() =>
      extractNestedPgpMimeCiphertext(
        envelope([control, payload, plain("extra")]),
      ),
    ).toThrow("Encrypted MIME control parts are invalid.");
    expect(() =>
      extractNestedPgpMimeCiphertext(
        envelope([control, multipart("mixed", "m", [payload])]),
      ),
    ).toThrow("Encrypted MIME control parts are invalid.");
  });
});
