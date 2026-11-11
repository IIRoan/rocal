import {
  isValidEmailAddress,
  getEmailDomain,
  normalizeEmailAddress,
  parseRecipientString,
  resolveEncryptionInternalDomain,
} from "./mail-addresses";

export function resolveMailSenderKeySource(input: {
  senderEmail: string | null | undefined;
  ownAddresses: readonly string[];
  internalDomain: string | null | undefined;
}): "self" | "directory" | "none" {
  const email = input.senderEmail
    ? normalizeEmailAddress(parseRecipientString(input.senderEmail).email)
    : "";
  if (!email || !isValidEmailAddress(email)) return "none";
  if (
    input.ownAddresses.some(
      (address) =>
        normalizeEmailAddress(parseRecipientString(address).email) === email,
    )
  ) {
    return "self";
  }
  const domain = resolveEncryptionInternalDomain(input.internalDomain);
  return domain && getEmailDomain(email) === domain ? "directory" : "none";
}

export function collectOwnMailAddresses(
  values: readonly (string | null | undefined)[],
): string[] {
  return [
    ...new Set(
      values.flatMap((value) =>
        value?.trim()
          ? [normalizeEmailAddress(parseRecipientString(value).email)]
          : [],
      ),
    ),
  ];
}
