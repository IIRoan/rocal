import {
  formatAuthResultsSummary,
  normalizeJmapHeaderValues,
  parseAuthResults,
} from "./auth-results";

describe("mail auth results parsing", () => {
  it("normalizes a lone header string into an array", () => {
    expect(
      normalizeJmapHeaderValues(
        "mx.google.com; dkim=pass header.i=@example.com; spf=pass",
      ),
    ).toEqual(["mx.google.com; dkim=pass header.i=@example.com; spf=pass"]);
  });

  it("keeps string arrays unchanged", () => {
    expect(normalizeJmapHeaderValues(["spf=pass", "dkim=fail"])).toEqual([
      "spf=pass",
      "dkim=fail",
    ]);
  });

  it("returns an empty array for nullish and invalid values", () => {
    expect(normalizeJmapHeaderValues(null)).toEqual([]);
    expect(normalizeJmapHeaderValues(undefined)).toEqual([]);
    expect(normalizeJmapHeaderValues(42)).toEqual([]);
    expect(normalizeJmapHeaderValues(["ok", 1, null])).toEqual(["ok"]);
  });

  it("parses SPF, DKIM, and DMARC from a string header value", () => {
    expect(
      parseAuthResults(
        "mx.google.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass",
      ),
    ).toEqual({
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
    });
  });

  it("parses combined values from multiple header lines", () => {
    expect(
      parseAuthResults([
        "relay.example.com; spf=softfail",
        "auth.example.com; dkim=fail; dmarc=fail",
      ]),
    ).toEqual({
      spf: "fail",
      dkim: "fail",
      dmarc: "fail",
    });
  });

  it("returns none when no auth data is present", () => {
    expect(parseAuthResults(null)).toEqual({
      spf: "none",
      dkim: "none",
      dmarc: "none",
    });
  });

  it("formats a summary for the native info alert", () => {
    expect(
      formatAuthResultsSummary({
        spf: "pass",
        dkim: "fail",
        dmarc: "none",
      }),
    ).toEqual(["SPF: pass", "DKIM: fail"]);
  });
});
