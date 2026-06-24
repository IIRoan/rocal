import type { JmapIdentity } from "./types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function splitEmailAddress(email: string): { local: string; domain: string } | null {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0) return null;
  return {
    local: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1),
  };
}

function getBaseLocalPart(email: string): string | null {
  const parts = splitEmailAddress(email);
  if (!parts) return null;
  const plusIndex = parts.local.indexOf("+");
  return plusIndex >= 0 ? parts.local.slice(0, plusIndex) : parts.local;
}

export type SubAddressTagSuggestion = {
  email: string;
  tag: string;
  label: string;
};

const COMMON_TAGS = [
  "newsletters",
  "shopping",
  "social",
  "work",
  "banking",
  "travel",
  "subscriptions",
  "receipts",
];

export function generateSubAddressTagSuggestions(
  fromEmail: string,
  options?: { recentTags?: string[] },
): SubAddressTagSuggestion[] {
  const base = getBaseLocalPart(fromEmail);
  const parts = splitEmailAddress(fromEmail);
  if (!base || !parts) return [];

  const domain = parts.domain;
  const usedTags = new Set<string>();
  const suggestions: SubAddressTagSuggestion[] = [];

  const seenEmails = new Set<string>();
  const addSuggestion = (tag: string) => {
    const email = `${base}+${tag}@${domain}`;
    if (seenEmails.has(email)) return;
    seenEmails.add(email);
    usedTags.add(tag);
    suggestions.push({ email, tag, label: `+${tag}` });
  };

  for (const tag of options?.recentTags ?? []) {
    addSuggestion(tag);
  }

  for (const tag of COMMON_TAGS) {
    if (suggestions.length >= 6) break;
    addSuggestion(tag);
  }

  return suggestions;
}

export function extractSubAddressTag(email: string): string | null {
  const parts = splitEmailAddress(email);
  if (!parts) return null;
  const plusIndex = parts.local.indexOf("+");
  if (plusIndex < 0) return null;
  return parts.local.slice(plusIndex + 1);
}

export function resolveSubAddressTagSelection(
  identities: JmapIdentity[],
  anchorEmail: string,
  tag: string,
): { identityId: string; fromEmailOverride?: string } | null {
  const parts = splitEmailAddress(anchorEmail);
  const base = getBaseLocalPart(anchorEmail);
  if (!parts || !base) return null;

  const newEmail = `${base}+${tag}@${parts.domain}`;
  const exactIdentity = identities.find(
    (identity) => normalizeEmail(identity.email) === normalizeEmail(newEmail),
  );
  if (exactIdentity) {
    return { identityId: exactIdentity.id };
  }

  const baseIdentity =
    identities.find((identity) => {
      const identityParts = splitEmailAddress(identity.email);
      if (!identityParts) return false;
      return (
        getBaseLocalPart(identity.email) === base &&
        identityParts.domain === parts.domain
      );
    }) ?? identities[0];
  if (!baseIdentity) return null;

  return {
    identityId: baseIdentity.id,
    fromEmailOverride: newEmail,
  };
}

export function extractUsedTagsFromIdentities(
  identities: JmapIdentity[],
  baseEmail: string,
): string[] {
  const base = getBaseLocalPart(baseEmail);
  const parts = splitEmailAddress(baseEmail);
  if (!base || !parts) return [];

  const tags: string[] = [];
  for (const identity of identities) {
    const idParts = splitEmailAddress(identity.email);
    if (!idParts) continue;
    if (idParts.domain !== parts.domain) continue;
    const idBase = getBaseLocalPart(identity.email);
    if (idBase !== base) continue;
    const tag = extractSubAddressTag(identity.email);
    if (tag) tags.push(tag);
  }
  return tags;
}
