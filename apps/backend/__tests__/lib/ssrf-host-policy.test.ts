import { describe, expect, it } from "@jest/globals";
import {
  canonicalizeHostForSsrfCheck,
  isPrivateNetworkHost,
} from "../../lib/ssrf-host-policy";

describe("ssrf-host-policy", () => {
  it("maps dotted IPv4-mapped IPv6 to IPv4", () => {
    expect(canonicalizeHostForSsrfCheck("::ffff:169.254.169.254")).toBe(
      "169.254.169.254",
    );
  });

  it("maps hex IPv4-mapped IPv6 to IPv4", () => {
    expect(canonicalizeHostForSsrfCheck("::ffff:a9fe:a9fe")).toBe(
      "169.254.169.254",
    );
    expect(canonicalizeHostForSsrfCheck("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(
      "169.254.169.254",
    );
  });

  it("blocks metadata and private IPv4-mapped addresses", () => {
    expect(isPrivateNetworkHost("::ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateNetworkHost("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateNetworkHost("10.0.0.1")).toBe(true);
    expect(isPrivateNetworkHost("8.8.8.8")).toBe(false);
  });
});
