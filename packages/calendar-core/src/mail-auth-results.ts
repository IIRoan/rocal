export type MailAuthStatus = "pass" | "fail" | "none" | "unknown";

export type MailAuthResult = {
  spf: MailAuthStatus;
  dkim: MailAuthStatus;
  dmarc: MailAuthStatus;
};

export const AUTH_RESULTS_JMAP_PROPERTY = "header:Authentication-Results:asText:all";

export type MailAuthResultsFields = {
  [AUTH_RESULTS_JMAP_PROPERTY]?: string[] | null;
};

/** JMAP header:* values are string arrays; some servers return a lone string. */
export function normalizeJmapHeaderValues(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

/** Only the topmost Authentication-Results is ours: Stalwart prepends it, anything below came with the message. */
export function getTrustedAuthResultsHeader(
  message: MailAuthResultsFields,
): string | null {
  return normalizeJmapHeaderValues(message[AUTH_RESULTS_JMAP_PROPERTY])[0] ?? null;
}

export function parseAuthResults(header: string | null | undefined): MailAuthResult {
  const result: MailAuthResult = {
    spf: "none",
    dkim: "none",
    dmarc: "none",
  };
  if (!header) return result;

  const value = header.toLowerCase();

  const spfMatch = value.match(
    /spf\s*=\s*(pass|fail|none|softfail|neutral|temperror|permerror)/,
  );
  if (spfMatch) {
    result.spf =
      spfMatch[1] === "softfail" || spfMatch[1] === "neutral"
        ? "fail"
        : (spfMatch[1] as MailAuthStatus);
  }

  const dkimMatch = value.match(/dkim\s*=\s*(pass|fail|none|temperror|permerror)/);
  if (dkimMatch) {
    result.dkim = dkimMatch[1] as MailAuthStatus;
  }

  const dmarcMatch = value.match(
    /dmarc\s*=\s*(pass|fail|none|bestguesspass|temperror|permerror)/,
  );
  if (dmarcMatch) {
    result.dmarc =
      dmarcMatch[1] === "bestguesspass" ? "pass" : (dmarcMatch[1] as MailAuthStatus);
  }

  return result;
}

export function hasAuthResults(results: MailAuthResult): boolean {
  return results.spf !== "none" || results.dkim !== "none" || results.dmarc !== "none";
}

export type MailAuthBadgeTone = "pass" | "fail" | "neutral";

export function resolveAuthBadgeTone(results: MailAuthResult): MailAuthBadgeTone {
  if (results.spf === "pass" && results.dkim === "pass") return "pass";
  if (results.spf === "fail" || results.dkim === "fail" || results.dmarc === "fail") {
    return "fail";
  }
  return "neutral";
}

export function formatAuthResultsSummary(
  results: MailAuthResult,
  options: { simpleLoginForward?: boolean } = {},
): string[] {
  const lines: string[] = [];
  if (results.spf !== "none") lines.push(`SPF: ${results.spf}`);
  if (results.dkim !== "none") lines.push(`DKIM: ${results.dkim}`);
  if (results.dmarc !== "none") lines.push(`DMARC: ${results.dmarc}`);
  // The rewritten From was never checked; the checks above are for SimpleLogin's relay.
  if (options.simpleLoginForward && lines.length > 0) {
    lines.push("Signed by SimpleLogin (simplelogin.co)");
  }
  return lines;
}
