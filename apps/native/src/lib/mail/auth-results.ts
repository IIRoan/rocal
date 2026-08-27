export type MailAuthResult = {
  spf: "pass" | "fail" | "none" | "unknown";
  dkim: "pass" | "fail" | "none" | "unknown";
  dmarc: "pass" | "fail" | "none" | "unknown";
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

export function parseAuthResults(headers: unknown): MailAuthResult {
  const result: MailAuthResult = {
    spf: "none",
    dkim: "none",
    dmarc: "none",
  };

  const normalized = normalizeJmapHeaderValues(headers);
  if (normalized.length === 0) return result;

  const combined = normalized.join("\n").toLowerCase();

  const spfMatch = combined.match(
    /spf\s*=\s*(pass|fail|none|softfail|neutral|temperror|permerror)/,
  );
  if (spfMatch) {
    result.spf =
      spfMatch[1] === "softfail" || spfMatch[1] === "neutral"
        ? "fail"
        : (spfMatch[1] as MailAuthResult["spf"]);
  }

  const dkimMatch = combined.match(
    /dkim\s*=\s*(pass|fail|none|temperror|permerror)/,
  );
  if (dkimMatch) {
    result.dkim = dkimMatch[1] as MailAuthResult["dkim"];
  }

  const dmarcMatch = combined.match(
    /dmarc\s*=\s*(pass|fail|none|bestguesspass|temperror|permerror)/,
  );
  if (dmarcMatch) {
    result.dmarc =
      dmarcMatch[1] === "bestguesspass"
        ? "pass"
        : (dmarcMatch[1] as MailAuthResult["dmarc"]);
  }

  return result;
}

export function formatAuthResultsSummary(results: MailAuthResult): string[] {
  const lines: string[] = [];
  if (results.spf !== "none") {
    lines.push(`SPF: ${results.spf}`);
  }
  if (results.dkim !== "none") {
    lines.push(`DKIM: ${results.dkim}`);
  }
  if (results.dmarc !== "none") {
    lines.push(`DMARC: ${results.dmarc}`);
  }
  return lines;
}
