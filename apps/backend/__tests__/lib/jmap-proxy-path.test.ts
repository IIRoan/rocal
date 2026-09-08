import { describe, expect, it } from "@jest/globals";
import {
  assertAllowedJmapUpstreamPath,
  buildSafeJmapUpstreamUrl,
  JmapProxyPathError,
  resolveAllowedJmapRedirectUrl,
} from "../../lib/jmap-proxy-path";

const base = "https://mail.solace.onl";

describe("jmap-proxy-path", () => {
  it("allows standard JMAP paths", () => {
    expect(assertAllowedJmapUpstreamPath(base, "/.well-known/jmap").pathname).toBe(
      "/.well-known/jmap",
    );
    expect(assertAllowedJmapUpstreamPath(base, "/jmap/").pathname).toBe("/jmap/");
    expect(
      assertAllowedJmapUpstreamPath(base, "/jmap/upload/account-1/").pathname,
    ).toBe("/jmap/upload/account-1/");
    expect(
      assertAllowedJmapUpstreamPath(
        base,
        "/jmap/download/account-1/blob-1/file.eml",
      ).pathname,
    ).toBe("/jmap/download/account-1/blob-1/file.eml");
    expect(
      assertAllowedJmapUpstreamPath(base, "/jmap/eventsource/").pathname,
    ).toBe("/jmap/eventsource/");
  });

  it("rejects percent-encoded traversal to admin APIs", () => {
    expect(() =>
      assertAllowedJmapUpstreamPath(
        base,
        "/jmap/%2e%2e%2f%2e%2e%2fapi/store/setting",
      ),
    ).toThrow(JmapProxyPathError);
    expect(() =>
      assertAllowedJmapUpstreamPath(base, "/jmap/../../api/store/setting"),
    ).toThrow(JmapProxyPathError);
    expect(() => assertAllowedJmapUpstreamPath(base, "/admin")).toThrow(
      JmapProxyPathError,
    );
    expect(() =>
      assertAllowedJmapUpstreamPath(base, "/slot-manager/status"),
    ).toThrow(JmapProxyPathError);
  });

  it("builds safe upstream URLs without host changes", () => {
    expect(
      buildSafeJmapUpstreamUrl(base, "/jmap/", "?types=Email"),
    ).toBe("https://mail.solace.onl/jmap/?types=Email");
  });

  it("allows same-origin JMAP redirects", () => {
    expect(
      resolveAllowedJmapRedirectUrl(
        base,
        "https://mail.solace.onl/.well-known/jmap",
        "/jmap/session",
      ),
    ).toBe("https://mail.solace.onl/jmap/session");
  });

  it("rejects cross-origin redirects", () => {
    expect(() =>
      resolveAllowedJmapRedirectUrl(
        base,
        "https://mail.solace.onl/.well-known/jmap",
        "https://evil.example/jmap/",
      ),
    ).toThrow(JmapProxyPathError);
  });
});
