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

describe("isPrivateNetworkHost ranges", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2001:0:4136:e378::1",
    "2130706433",
    "0x7f000001",
    "0177.0.0.1",
    "127.1",
    "localhost",
    "foo.localhost",
    "printer.local",
    "metadata.google.internal",
  ])("blocks %s", (host) => {
    expect(isPrivateNetworkHost(host)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "example.com"])(
    "allows %s",
    (host) => {
      expect(isPrivateNetworkHost(host)).toBe(false);
    },
  );
});
