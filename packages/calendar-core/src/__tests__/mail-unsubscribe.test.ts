import { describe, expect, it } from "@jest/globals";
import { SIMPLELOGIN_DONE_KEYWORD } from "../mail-simplelogin";
import {
  describeMailUnsubscribe,
  getMailUnsubscribe,
  getMailUnsubscribePage,
  MAIL_UNSUBSCRIBED_KEYWORD,
  type MailUnsubscribeFields,
} from "../mail-unsubscribe";

const DKIM_PASS = "mx.solace.onl; dkim=pass header.d=news.example; spf=pass";
const ALL = { allowOneClick: true, allowMailto: true };

function listMessage(overrides: Partial<MailUnsubscribeFields> & Record<string, unknown> = {}) {
  return {
    "header:Authentication-Results:asText:all": [DKIM_PASS],
    "header:List-Unsubscribe:asURLs": [
      "mailto:leave@news.example?subject=stop%20123",
      "https://news.example/u/abc?t=1",
    ],
    "header:List-Unsubscribe-Post:asText": "List-Unsubscribe=One-Click",
    ...overrides,
  };
}

describe("getMailUnsubscribe", () => {
  it("orders one-click, mailto and the https page", () => {
    expect(getMailUnsubscribe(listMessage(), ALL)).toEqual({
      host: "news.example",
      targets: [
        { type: "one-click", url: "https://news.example/u/abc?t=1" },
        { type: "mailto", to: "leave@news.example", subject: "stop 123", body: "Please unsubscribe me." },
        { type: "https", url: "https://news.example/u/abc?t=1" },
      ],
    });
  });

  it("offers one-click only for the RFC 8058 post value and when allowed", () => {
    const types = (message: ReturnType<typeof listMessage>, options = ALL) =>
      getMailUnsubscribe(message, options)?.targets.map((target) => target.type);
    expect(types(listMessage({ "header:List-Unsubscribe-Post:asText": "  list-unsubscribe=one-click " }))).toEqual(["one-click", "mailto", "https"]);
    expect(types(listMessage({ "header:List-Unsubscribe-Post:asText": null }))).toEqual(["mailto", "https"]);
    expect(types(listMessage({ "header:List-Unsubscribe-Post:asText": "List-Unsubscribe=Maybe" }))).toEqual(["mailto", "https"]);
    expect(types(listMessage(), { allowOneClick: false, allowMailto: true })).toEqual(["mailto", "https"]);
    expect(types(listMessage(), { allowOneClick: false, allowMailto: false })).toEqual(["https"]);
  });

  it("finds the sender's page to offer after a failed unsubscribe", () => {
    expect(getMailUnsubscribePage(listMessage())).toBe("https://news.example/u/abc?t=1");
    expect(getMailUnsubscribePage(listMessage({ "header:List-Unsubscribe:asURLs": ["mailto:leave@news.example"] }))).toBeNull();
    expect(getMailUnsubscribePage(listMessage({ "header:Authentication-Results:asText:all": ["mx; dkim=fail"] }))).toBeNull();
  });

  it("requires DKIM pass and leaves SimpleLogin forwards to their own line", () => {
    expect(getMailUnsubscribe(listMessage({ "header:Authentication-Results:asText:all": ["mx; dkim=fail"] }), ALL)).toBeNull();
    expect(getMailUnsubscribe(listMessage({ "header:Authentication-Results:asText:all": ["mx; spf=pass", DKIM_PASS] }), ALL)).toBeNull();
    expect(getMailUnsubscribe(listMessage({ "header:X-Solace-SimpleLogin:asText": "forward" }), ALL)).toBeNull();
  });

  it("refuses LAN, IP and plain http targets", () => {
    for (const url of [
      "http://news.example/u",
      "https://192.168.1.10/u",
      "https://127.1/u",
      "https://0x7f.1/u",
      "https://[::1]/u",
      "https://printer.local/u",
      "https://router.home.arpa/u",
      "https://localhost/u",
      "https://news.example/u with space",
    ]) {
      expect(getMailUnsubscribe(listMessage({ "header:List-Unsubscribe:asURLs": [url] }), ALL)).toBeNull();
    }
  });

  it("uses mailto defaults, needs exactly one recipient and caps the URLs", () => {
    const mailto = (url: string) =>
      getMailUnsubscribe(listMessage({ "header:List-Unsubscribe:asURLs": [url] }), ALL)?.targets[0] ?? null;
    expect(mailto("mailto:leave@news.example")).toEqual({
      type: "mailto",
      to: "leave@news.example",
      subject: "Unsubscribe",
      body: "Please unsubscribe me.",
    });
    expect(mailto("mailto:a@news.example,b@news.example")).toBeNull();
    expect(mailto(`https://news.example/${"x".repeat(2_100)}`)).toBeNull();
    const ninth = getMailUnsubscribe(
      listMessage({ "header:List-Unsubscribe:asURLs": [...Array(8).fill("ftp://x"), "https://news.example/u"] }),
      ALL,
    );
    expect(ninth).toBeNull();
  });

  it("shares SimpleLogin's done keyword", () => {
    expect(MAIL_UNSUBSCRIBED_KEYWORD).toBe(SIMPLELOGIN_DONE_KEYWORD);
  });
});

describe("describeMailUnsubscribe", () => {
  it("says what each method does", () => {
    expect(describeMailUnsubscribe({ type: "one-click", url: "https://news.example/u" }, "me@solace.onl")).toBe(
      "Solace asks news.example to remove me@solace.onl from this list. The sender sees your IP address.",
    );
    expect(
      describeMailUnsubscribe({ type: "mailto", to: "leave@news.example", subject: "", body: "" }, "me@solace.onl"),
    ).toBe("Solace sends an unsubscribe email from me@solace.onl to leave@news.example.");
    expect(describeMailUnsubscribe({ type: "https", url: "https://xn--nws-xla.example/u" }, "me@solace.onl")).toBe(
      "Opens the sender's unsubscribe page at xn--nws-xla.example. This address uses international or look-alike characters. Check that it's the site you expect.",
    );
  });
});
