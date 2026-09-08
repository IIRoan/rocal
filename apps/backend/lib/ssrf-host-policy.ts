import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Normalize IPv4-mapped IPv6 literals to dotted-quad for SSRF checks. */
export function canonicalizeHostForSsrfCheck(hostname: string): string {
  const stripped = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (stripped.startsWith("::ffff:")) {
    const v4Tail = stripped.slice("::ffff:".length);
    if (isIP(v4Tail) === 4) {
      return v4Tail;
    }
  }

  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(stripped);
  if (hexMapped?.[1] && hexMapped[2]) {
    const hi = Number.parseInt(hexMapped[1], 16);
    const lo = Number.parseInt(hexMapped[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  const expandedMapped =
    /^(?:0*:){1,6}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(stripped);
  if (expandedMapped?.[1] && expandedMapped[2]) {
    const hi = Number.parseInt(expandedMapped[1], 16);
    const lo = Number.parseInt(expandedMapped[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return stripped;
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const canonical = canonicalizeHostForSsrfCheck(hostname);

  if (
    canonical === "localhost" ||
    canonical === "0.0.0.0" ||
    canonical === "::" ||
    canonical === "::1" ||
    canonical.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = isIP(canonical);

  if (ipVersion === 4) {
    const [firstOctet = 0, secondOctet = 0] = canonical
      .split(".")
      .map((octet) => Number.parseInt(octet, 10));

    return (
      firstOctet === 0 ||
      firstOctet === 10 ||
      firstOctet === 127 ||
      (firstOctet === 169 && secondOctet === 254) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      (firstOctet === 192 && secondOctet === 168)
    );
  }

  if (ipVersion === 6) {
    const lower = canonical.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower)
    );
  }

  return false;
}

export async function assertPublicHostnameResolves(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateNetworkHost(hostname)) {
      throw new Error("private-network-host");
    }
    return;
  }

  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    if (isPrivateNetworkHost(record.address)) {
      throw new Error("private-network-host");
    }
  }
}
