import { describe, expect, it } from "@jest/globals";
import {
  MAILTO_MAX_BODY_LENGTH,
  MAILTO_MAX_LENGTH,
  MAILTO_MAX_RECIPIENTS,
  MAILTO_MAX_SUBJECT_LENGTH,
  parseMailtoLink,
} from "../mail-mailto";

describe("parseMailtoLink", () => {
  it("parses RFC 6068 fields with a literal plus and case-insensitive keys", () => {
    expect(
      parseMailtoLink("MAILTO:list@example.org?SUBJECT=a+b%20c&Body=Hi+there&In-Reply-To=%3Cx%40y%3E"),
    ).toEqual({ to: ["list@example.org"], cc: [], bcc: [], subject: "a+b c", body: "Hi+there" });
  });

  it("keeps an encoded comma inside one address and merges repeated to fields", () => {
    expect(parseMailtoLink("mailto:first%2Clast@example.org")?.to).toEqual(["first,last@example.org"]);
    expect(
      parseMailtoLink("mailto:a@example.org,B@example.org?to=c@example.org&to=b@example.org&cc=d@example.org&bcc=e@example.org")
    ).toMatchObject({
      to: ["a@example.org", "b@example.org", "c@example.org"],
      cc: ["d@example.org"],
      bcc: ["e@example.org"],
    });
  });

  it("normalizes body line breaks and strips control characters", () => {
    const draft = parseMailtoLink("mailto:a@example.org?body=one%0D%0Atwo%0Dthree%07%09x&subject=a%0Ab%00c");
    expect(draft?.body).toBe("one\ntwo\nthree\tx");
    expect(draft?.subject).toBe("a b c");
  });

  it("lets the first decodable subject and body win and drops the fragment", () => {
    const draft = parseMailtoLink("mailto:a@example.org?subject=%E0%A4%A&subject=Second&subject=Third&body=One&body=Two#frag");
    expect(draft).toMatchObject({ subject: "Second", body: "One" });
  });

  it("opens a blank draft for a bare mailto", () => {
    expect(parseMailtoLink("mailto:")).toEqual({ to: [], cc: [], bcc: [], subject: "", body: "" });
  });

  it("rejects other schemes and over-long links", () => {
    expect(parseMailtoLink("javascript:alert(1)")).toBeNull();
    expect(parseMailtoLink("https://example.org/?mailto:a@example.org")).toBeNull();
    expect(parseMailtoLink(`mailto:a@example.org?body=${"x".repeat(MAILTO_MAX_LENGTH)}`)).toBeNull();
  });

  it("drops invalid addresses and applies the caps", () => {
    const many = Array.from({ length: MAILTO_MAX_RECIPIENTS + 5 }, (_, index) => `u${index}@example.org`).join(",");
    const draft = parseMailtoLink(
      `mailto:not-an-address,%ZZ@example.org,${many}?subject=${"s".repeat(2000)}&body=${"b".repeat(MAILTO_MAX_BODY_LENGTH + 10)}`,
    );
    expect(draft?.to).toHaveLength(MAILTO_MAX_RECIPIENTS);
    expect(draft?.to[0]).toBe("u0@example.org");
    expect(draft?.subject).toHaveLength(MAILTO_MAX_SUBJECT_LENGTH);
    expect(draft?.body).toHaveLength(MAILTO_MAX_BODY_LENGTH);
  });
});
