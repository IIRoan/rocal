import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Parse inet_aton-style IPv4 literals (`2130706433`, `0177.0.0.1`, `0x7f.1`) into dotted-quad. */
export function normalizeIpv4Literal(value: string): string | null {
  const parts = value.split(".");
  if (parts.length === 0 || parts.length > 4) {
    return null;
  }

  const numbers: number[] = [];
  for (const part of parts) {
    let parsed: number;
    if (/^0x[0-9a-f]*$/i.test(part)) {
      parsed = part.length === 2 ? 0 : Number.parseInt(part.slice(2), 16);
    } else if (/^0[0-7]+$/.test(part)) {
      parsed = Number.parseInt(part, 8);
    } else if (/^(0|[1-9][0-9]*)$/.test(part)) {
      parsed = Number.parseInt(part, 10);
    } else {
      return null;
    }
    if (!Number.isSafeInteger(parsed)) {
      return null;
    }
    numbers.push(parsed);
  }

  const last = numbers.pop() ?? 0;
  if (numbers.some((octet) => octet > 255)) {
    return null;
  }
  const remainingBytes = 4 - numbers.length;
  if (last >= 2 ** (8 * remainingBytes)) {
    return null;
  }

  const octets = [...numbers];
  for (let index = remainingBytes - 1; index >= 0; index--) {
    octets.push(Math.floor(last / 2 ** (8 * index)) % 256);
  }
  return octets.join(".");
}

function parseIpv6(address: string): number[] | null {
  const withoutZone = address.split("%")[0] ?? "";
  if (isIP(withoutZone) !== 6) {
    return null;
  }

  let head = withoutZone;
  const tailBytes: number[] = [];
  const dottedTail = /:(\d+\.\d+\.\d+\.\d+)$/.exec(head);
  if (dottedTail?.[1]) {
    tailBytes.push(...dottedTail[1].split(".").map(Number));
    head = `${head.slice(0, dottedTail.index)}:0:0`;
  }

  const [left = "", right] = head.split("::");
  const toGroups = (segment: string) =>
    segment ? segment.split(":").map((group) => Number.parseInt(group, 16)) : [];
  const leftGroups = toGroups(left);
  const rightGroups = right === undefined ? [] : toGroups(right);
  const zeros = 8 - leftGroups.length - rightGroups.length;
  const groups = [...leftGroups, ...Array<number>(Math.max(zeros, 0)).fill(0), ...rightGroups];

  const bytes = groups.flatMap((group) => [(group >> 8) & 0xff, group & 0xff]);
  if (tailBytes.length === 4) {
    bytes.splice(12, 4, ...tailBytes);
  }
  return bytes.length === 16 ? bytes : null;
}

function bytesMatchPrefix(bytes: number[], prefix: number[], bits: number): boolean {
  for (let bit = 0; bit < bits; bit++) {
    const byteIndex = bit >> 3;
    const mask = 0x80 >> (bit % 8);
    if (((bytes[byteIndex] ?? 0) & mask) !== ((prefix[byteIndex] ?? 0) & mask)) {
      return false;
    }
  }
  return true;
}

/** Non-public IPv4 ranges (RFC 6890 special-purpose + multicast/broadcast). */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [number[], number]> = [
  [[0, 0, 0, 0], 8],
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 0, 2, 0], 24],
  [[192, 88, 99, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
];

/** Only consulted for 2000::/3; IPv4-embedding ranges (NAT64, 6to4, Teredo) are blocked outright. */
const BLOCKED_IPV6_GLOBAL_CIDRS: ReadonlyArray<readonly [number[], number]> = [
  [[0x20, 0x01, 0x00, 0x00], 32],
  [[0x20, 0x01, 0x00, 0x02], 48],
  [[0x20, 0x01, 0x0d, 0xb8], 32],
  [[0x20, 0x02], 16],
  [[0x3f, 0xff], 16],
];

function isBlockedIpv4(address: string): boolean {
  const bytes = address.split(".").map(Number);
  return BLOCKED_IPV4_CIDRS.some(([prefix, bits]) =>
    bytesMatchPrefix(bytes, prefix, bits),
  );
}

function isBlockedIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) {
    return true;
  }
  if (!bytesMatchPrefix(bytes, [0x20], 3)) {
    return true;
  }
  return BLOCKED_IPV6_GLOBAL_CIDRS.some(([prefix, bits]) =>
    bytesMatchPrefix(bytes, prefix, bits),
  );
}

/** Normalize IPv4-mapped IPv6 and numeric IPv4 literals for SSRF checks. */
export function canonicalizeHostForSsrfCheck(hostname: string): string {
  const stripped = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (isIP(stripped) === 6) {
    const bytes = parseIpv6(stripped);
    if (bytes && bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
      return bytes.slice(12).join(".");
    }
    return stripped;
  }

  return normalizeIpv4Literal(stripped) ?? stripped;
}

/** True unless the host is a plain public IP or DNS name; anything unrecognised is refused. */
export function isPrivateNetworkHost(hostname: string): boolean {
  const canonical = canonicalizeHostForSsrfCheck(hostname);

  if (!canonical) {
    return true;
  }

  const ipVersion = isIP(canonical);
  if (ipVersion === 4) {
    return isBlockedIpv4(canonical);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(canonical);
  }

  if (
    canonical === "localhost" ||
    canonical.endsWith(".localhost") ||
    canonical.endsWith(".local") ||
    canonical.endsWith(".internal")
  ) {
    return true;
  }

  // Numeric hosts that did not normalize are resolver-dependent; refuse rather than guess.
  return /^[0-9.]+$/.test(canonical) || /^0x/i.test(canonical);
}

export async function assertPublicHostnameResolves(hostname: string): Promise<void> {
  if (isPrivateNetworkHost(hostname)) {
    throw new Error("private-network-host");
  }
  if (isIP(canonicalizeHostForSsrfCheck(hostname))) {
    return;
  }

  const records = await lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("private-network-host");
  }
  for (const record of records) {
    if (isPrivateNetworkHost(record.address)) {
      throw new Error("private-network-host");
    }
  }
}
