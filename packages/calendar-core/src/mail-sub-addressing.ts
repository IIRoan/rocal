/** Default sub-address delimiter (RFC 5233; Postfix/Stalwart use "+"). */
export const DEFAULT_SUB_ADDRESS_DELIMITER = "+";

export type ParsedSubAddress = {
  localPart: string;
  baseUser: string;
  tag: string | null;
  domain: string;
  fullAddress: string;
};

/** Parse `user+tag@domain` style addresses. */
export function parseSubAddress(
  email: string,
  delimiter: string = DEFAULT_SUB_ADDRESS_DELIMITER,
): ParsedSubAddress {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return {
      localPart: localPart || "",
      baseUser: localPart || "",
      tag: null,
      domain: domain || "",
      fullAddress: email,
    };
  }

  const delimiterIndex = localPart.indexOf(delimiter);
  if (delimiterIndex === -1) {
    return {
      localPart,
      baseUser: localPart,
      tag: null,
      domain,
      fullAddress: email,
    };
  }

  const baseUser = localPart.substring(0, delimiterIndex);
  const tag = localPart.substring(delimiterIndex + delimiter.length);

  return {
    localPart,
    baseUser,
    tag: tag || null,
    domain,
    fullAddress: email,
  };
}
