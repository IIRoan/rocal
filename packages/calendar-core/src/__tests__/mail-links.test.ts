import { describe, expect, it } from "@jest/globals";
import {
  assessMailLink,
  describeMailLink,
  getLinkHost,
  shouldConfirmMailLink,
  stripTrackingParams,
} from "../mail-links";

describe("getLinkHost", () => {
  it("reads the host of absolute http(s) URLs", () => {
    expect(getLinkHost("https://user:pw@Example.COM:8443/path")).toBe("example.com");
    expect(getLinkHost("http://[2001:db8::1]:80/")).toBe("[2001:db8::1]");
    expect(getLinkHost("https://example.com./x")).toBe("example.com");
    expect(getLinkHost("https://good.example\\@evil.test/")).toBe("good.example");
    expect(getLinkHost("HTTPS://EXAMPLE.ORG")).toBe("example.org");
  });

  it("refuses other schemes and relative URLs", () => {
    expect(getLinkHost("mailto:a@example.com")).toBeNull();
    expect(getLinkHost("javascript:alert(1)")).toBeNull();
    expect(getLinkHost("//example.com/x")).toBeNull();
    expect(getLinkHost("https:///path")).toBeNull();
  });
});

describe("stripTrackingParams", () => {
  it("drops tracker keys and keeps other pairs, their order and the fragment", () => {
    expect(
      stripTrackingParams("https://shop.example/p?id=7&utm_source=mail&UTM_Medium=x&fbclid=abc&ref=nav&%67clid=1#reviews"),
    ).toBe("https://shop.example/p?id=7&ref=nav#reviews");
    expect(stripTrackingParams("https://shop.example/?utm_campaign=x&mc_eid=1")).toBe("https://shop.example/");
  });

  it("leaves untouched links byte-for-byte and is idempotent", () => {
    const untouched = "https://example.com/?a=1&&b=%20&source=x&trk=y#f?utm_source=z";
    expect(stripTrackingParams(untouched)).toBe(untouched);
    const once = stripTrackingParams("https://example.com/?gclid=1&q=a+b");
    expect(stripTrackingParams(once)).toBe(once);
    expect(stripTrackingParams("mailto:a@example.com?utm_source=x")).toBe("mailto:a@example.com?utm_source=x");
  });
});

describe("assessMailLink", () => {
  it("warns on every international host", () => {
    expect(assessMailLink("https://xn--pple-43d.com/", "Apple").warnings).toEqual(["international-host"]);
    expect(assessMailLink("https://login.xn--80ak6aa92e.com/", "").warnings).toEqual(["international-host"]);
    expect(assessMailLink("https://аpple.com/", "").warnings).toEqual(["international-host"]);
    expect(assessMailLink("https://apple.com/", "").warnings).toEqual([]);
  });

  it("flags link text that names another site", () => {
    expect(assessMailLink("https://paypal.com.evil.test/login", "paypal.com")).toEqual({
      host: "paypal.com.evil.test",
      textHost: "paypal.com",
      warnings: ["text-mismatch"],
    });
    expect(assessMailLink("https://www.example.com/a", "example.com").warnings).toEqual([]);
    expect(assessMailLink("https://example.com/a", "https://www.example.com/a").warnings).toEqual([]);
    expect(assessMailLink("https://mail.example.com/", "example.com").warnings).toEqual([]);
    expect(assessMailLink("https://example.com/", "<https://mail.example.com/x?y=1>").warnings).toEqual([]);
    expect(assessMailLink("https://example.com/", "Read the full story").textHost).toBeNull();
  });

  it("reads look-alike, hidden and dotted hosts in the text, so they always ask", () => {
    for (const text of [
      "pаypal.com",
      "pay​pal.com",
      "paypal.com.",
      "https://paypal.com./login",
      "ｐａｙｐａｌ．ｃｏｍ",
      "‮moc.lapyap",
    ]) {
      const assessment = assessMailLink("https://evil.example/", text);
      expect(assessment.warnings).toEqual(["text-mismatch"]);
      expect(shouldConfirmMailLink(assessment, false)).toBe(true);
    }
    expect(assessMailLink("https://paypal.com/", "pay­pal.com.﻿").warnings).toEqual([]);
    for (const text of ["Click here", "e.g.", "v1.2", "詳細はこちら", "Lees meer…"]) {
      expect(assessMailLink("https://example.com/", text).textHost).toBeNull();
    }
  });
});

describe("describeMailLink", () => {
  it("names the real host and every warning", () => {
    expect(describeMailLink(assessMailLink("https://example.com/", "Hi"))).toEqual({
      title: "Open this link?",
      lines: ["Opens example.com."],
    });
    expect(describeMailLink(assessMailLink("https://xn--pple-43d.com/", "apple.com")).lines).toEqual([
      "Opens xn--pple-43d.com.",
      "This address uses international or look-alike characters. Check that it's the site you expect.",
      "The link text shows apple.com, but it opens xn--pple-43d.com.",
    ]);
  });

  it("always confirms a warned link", () => {
    expect(shouldConfirmMailLink(assessMailLink("https://example.com/", ""), false)).toBe(false);
    expect(shouldConfirmMailLink(assessMailLink("https://example.com/", ""), true)).toBe(true);
    expect(shouldConfirmMailLink(assessMailLink("https://evil.test/", "bank.example"), false)).toBe(true);
  });
});
