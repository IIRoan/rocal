import {
  DEFAULT_SUB_ADDRESS_DELIMITER,
  parseSubAddress,
} from "./mail-sub-addressing";

export type MailIdentityRef = {
  id?: string;
  email: string;
  name?: string | null;
};

export type MailIdentityBadgeInfo = {
  fromAddress: string;
  displayTag: string | null;
  matchingIdentity: MailIdentityRef | null;
};

type MailIdentityMessage = {
  from?: Array<{ email: string; name?: string | null }>;
  to?: Array<{ email: string; name?: string | null }>;
};

export type ResolveMailIdentityBadgeOptions = {
  subAddressDelimiter?: string;
  /** When false, ignore From matches (e.g. likely spoofed). */
  trustFromIdentity?: boolean;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function identityMatchesBase(
  identity: MailIdentityRef,
  baseUser: string,
  domain: string,
): boolean {
  const parsed = parseSubAddress(normalizeEmail(identity.email));
  return (
    normalizeEmail(identity.email) === `${baseUser}@${domain}` ||
    (parsed.baseUser === baseUser && parsed.domain === domain)
  );
}

/** Resolve which identity/sub-address badge to show for a message, if any. */
export function resolveMailIdentityBadge(
  message: MailIdentityMessage,
  identities: MailIdentityRef[],
  options: ResolveMailIdentityBadgeOptions = {},
): MailIdentityBadgeInfo | null {
  const delimiter = options.subAddressDelimiter ?? DEFAULT_SUB_ADDRESS_DELIMITER;
  const trustFromIdentity = options.trustFromIdentity ?? true;
  const fromAddress = message.from?.[0]?.email;
  if (!fromAddress || identities.length === 0) return null;

  const parsedFrom = parseSubAddress(normalizeEmail(fromAddress), delimiter);

  const matchingIdentity = trustFromIdentity
    ? identities.find(
        (identity) =>
          normalizeEmail(identity.email) === normalizeEmail(fromAddress) ||
          identityMatchesBase(identity, parsedFrom.baseUser, parsedFrom.domain),
      )
    : undefined;

  let receivedToTag: string | null = null;
  if (!matchingIdentity) {
    for (const recipient of message.to ?? []) {
      const parsedTo = parseSubAddress(normalizeEmail(recipient.email), delimiter);
      if (!parsedTo.tag) continue;

      const matchesIdentity = identities.some((identity) =>
        identityMatchesBase(identity, parsedTo.baseUser, parsedTo.domain),
      );
      if (matchesIdentity) {
        receivedToTag = parsedTo.tag;
        break;
      }
    }
  }

  const displayTag = matchingIdentity ? parsedFrom.tag : receivedToTag;
  if (!matchingIdentity && !receivedToTag) return null;

  return {
    fromAddress,
    displayTag,
    matchingIdentity: matchingIdentity ?? null,
  };
}

export function shouldShowIdentityNameBadge(
  info: MailIdentityBadgeInfo,
): boolean {
  if (info.displayTag) return false;
  const identity = info.matchingIdentity;
  if (!identity?.name?.trim()) return false;
  const name = identity.name.trim();
  return (
    name !== identity.email &&
    normalizeEmail(name) !== normalizeEmail(info.fromAddress)
  );
}
