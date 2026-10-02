import { describe, expect, it } from "@jest/globals";

import {
  formatAuthResultsSummary,
  getTrustedAuthResultsHeader,
  hasAuthResults,
  normalizeJmapHeaderValues,
  parseAuthResults,
  resolveAuthBadgeTone,
} from "../mail-auth-results";

describe("mail auth results", () => {
  it("normalizes JMAP header values", () => {
    expect(normalizeJmapHeaderValues("spf=pass")).toEqual(["spf=pass"]);
    expect(normalizeJmapHeaderValues(["spf=pass", "dkim=fail"])).toEqual([
      "spf=pass",
      "dkim=fail",
    ]);
    expect(normalizeJmapHeaderValues(null)).toEqual([]);
    expect(normalizeJmapHeaderValues(42)).toEqual([]);
    expect(normalizeJmapHeaderValues(["ok", 1, null])).toEqual(["ok"]);
  });

  it("trusts only the topmost Authentication-Results instance", () => {
    const header = getTrustedAuthResultsHeader({
      "header:Authentication-Results:asText:all": [
        "mx.solace.onl; dkim=fail; spf=fail",
        "forged.example; dkim=pass; spf=pass; dmarc=pass",
      ],
    });
    expect(header).toBe("mx.solace.onl; dkim=fail; spf=fail");
    expect(parseAuthResults(header)).toEqual({ spf: "fail", dkim: "fail", dmarc: "none" });
    expect(getTrustedAuthResultsHeader({})).toBeNull();
  });

  it("parses SPF, DKIM, and DMARC from one header", () => {
    const results = parseAuthResults(
      "mx.solace.onl; dkim=pass header.d=simplelogin.co; spf=softfail; dmarc=bestguesspass",
    );
    expect(results).toEqual({ spf: "fail", dkim: "pass", dmarc: "pass" });
    expect(resolveAuthBadgeTone(results)).toBe("fail");
    expect(hasAuthResults(parseAuthResults(null))).toBe(false);
  });

  it("names SimpleLogin as the signer for marked forwards", () => {
    const results = { spf: "pass", dkim: "pass", dmarc: "pass" } as const;
    expect(resolveAuthBadgeTone(results)).toBe("pass");
    expect(formatAuthResultsSummary(results, { simpleLoginForward: true })).toEqual([
      "SPF: pass",
      "DKIM: pass",
      "DMARC: pass",
      "Signed by SimpleLogin (simplelogin.co)",
    ]);
    expect(formatAuthResultsSummary({ spf: "pass", dkim: "fail", dmarc: "none" })).toEqual([
      "SPF: pass",
      "DKIM: fail",
    ]);
  });
});
