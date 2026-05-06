export interface LinkedAuthAccountLike {
  providerId?: string | null;
  provider?: string | null;
  account?: {
    providerId?: string | null;
    provider?: string | null;
  } | null;
}

export interface LinkedAuthAccountSummary {
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  isOAuthOnly: boolean;
}

const PASSWORD_PROVIDER_IDS = new Set([
  "email-and-password",
  "email-password",
  "credential",
  "password",
  "email",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractProviderId(account: LinkedAuthAccountLike): string | null {
  const providerId =
    account.providerId ??
    account.provider ??
    account.account?.providerId ??
    account.account?.provider;

  return typeof providerId === "string" && providerId.trim().length > 0
    ? providerId.trim().toLowerCase()
    : null;
}

function extractLinkedAuthAccountsAtDepth(
  value: unknown,
  depth: number,
): LinkedAuthAccountLike[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as LinkedAuthAccountLike[];
  }

  if (!isRecord(value) || depth >= 3) {
    return [];
  }

  const nestedKeys = ["accounts", "data", "items", "results"] as const;

  for (const key of nestedKeys) {
    const nestedValue = value[key];
    const accounts = extractLinkedAuthAccountsAtDepth(nestedValue, depth + 1);

    if (accounts.length > 0) {
      return accounts;
    }
  }

  return [];
}

export function extractLinkedAuthAccounts(
  value: unknown,
): LinkedAuthAccountLike[] {
  return extractLinkedAuthAccountsAtDepth(value, 0);
}

export function summarizeLinkedAuthAccounts(
  value: unknown,
): LinkedAuthAccountSummary {
  const providerIds = extractLinkedAuthAccounts(value)
    .map(extractProviderId)
    .filter((providerId): providerId is string => providerId !== null);
  const hasPasswordAccount = providerIds.some((providerId) =>
    PASSWORD_PROVIDER_IDS.has(providerId),
  );
  const hasOAuthAccount = providerIds.some(
    (providerId) => !PASSWORD_PROVIDER_IDS.has(providerId),
  );

  return {
    hasPasswordAccount,
    hasOAuthAccount,
    isOAuthOnly: hasOAuthAccount && !hasPasswordAccount,
  };
}
