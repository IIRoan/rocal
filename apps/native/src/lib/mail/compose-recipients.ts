import {
  formatRecentContactForField,
  isValidEmailAddress,
  parseRecipientString,
  type ParsedMailAddress,
  type RecentContactEntry,
} from "@workspace/calendar-core";

export function serializeRecipientChip(address: ParsedMailAddress): string {
  const name = address.name?.trim();
  if (name && name.toLowerCase() !== address.email) {
    return `${name} <${address.email}>`;
  }
  return address.email;
}

export function serializeRecipientField(
  chips: ParsedMailAddress[],
  draft = "",
): string {
  const serialized = chips.map(serializeRecipientChip).join(", ");
  const trimmedDraft = draft.trim();
  if (!trimmedDraft) {
    return serialized;
  }
  return serialized ? `${serialized}, ${draft}` : draft;
}

export function recipientChipLabel(address: ParsedMailAddress): string {
  return address.name?.trim() || address.email;
}

function dedupeChips(addresses: ParsedMailAddress[]): ParsedMailAddress[] {
  const seen = new Set<string>();
  const chips: ParsedMailAddress[] = [];
  for (const address of addresses) {
    if (!address.email || seen.has(address.email)) continue;
    seen.add(address.email);
    chips.push(address);
  }
  return chips;
}

function tokenToChip(token: string): ParsedMailAddress | null {
  const parsed = parseRecipientString(token);
  if (!isValidEmailAddress(parsed.email)) {
    return null;
  }
  return parsed;
}

/** Split a compose To/Cc/Bcc string into committed chips and the in-progress token. */
export function parseRecipientField(raw: string): {
  chips: ParsedMailAddress[];
  draft: string;
} {
  if (!raw.trim()) {
    return { chips: [], draft: "" };
  }

  const trailingSeparator = /[,;]\s*$/.test(raw);
  const tokens = raw.split(/[,;]/).map((token) => token.trim());
  const lastIndex = tokens.length - 1;
  const head = trailingSeparator ? tokens : tokens.slice(0, lastIndex);
  const last = trailingSeparator ? "" : (tokens[lastIndex] ?? "");

  const chips: ParsedMailAddress[] = [];
  for (const token of head) {
    if (!token) continue;
    const chip = tokenToChip(token);
    if (chip) chips.push(chip);
  }

  if (last) {
    const chip = tokenToChip(last);
    if (chip) {
      chips.push(chip);
      return { chips: dedupeChips(chips), draft: "" };
    }
  }

  return { chips: dedupeChips(chips), draft: last };
}

export function consumeRecipientDraft(draft: string): {
  chips: ParsedMailAddress[];
  draft: string;
} {
  return parseRecipientField(draft);
}

export function shouldCommitDraftOnChange(text: string): boolean {
  if (/[,;\n]/.test(text)) {
    return true;
  }
  return text.endsWith(" ") && isValidEmailAddress(text.trim());
}

export function addRecipientChip(
  chips: ParsedMailAddress[],
  entry: RecentContactEntry | ParsedMailAddress,
): ParsedMailAddress[] {
  const parsed =
    "lastUsedAt" in entry
      ? parseRecipientString(formatRecentContactForField(entry))
      : entry;
  if (!isValidEmailAddress(parsed.email)) {
    return chips;
  }
  return dedupeChips([...chips, parsed]);
}

export function removeRecipientChip(
  chips: ParsedMailAddress[],
  email: string,
): ParsedMailAddress[] {
  const normalized = email.trim().toLowerCase();
  return chips.filter((chip) => chip.email !== normalized);
}

/** Committed chip emails only — in-progress draft tokens are not excluded. */
export function collectCommittedEmails(...fields: string[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const field of fields) {
    for (const chip of parseRecipientField(field).chips) {
      if (seen.has(chip.email)) continue;
      seen.add(chip.email);
      emails.push(chip.email);
    }
  }
  return emails;
}
