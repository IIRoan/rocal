import { z } from "zod";
import product from "./product-info.json";

export const PRODUCT_ROUTES = {
  privacy: product.privacyPath,
  support: product.supportPath,
} as const;

export const PRODUCT_ISSUES_URL = product.issuesUrl;

/** Support handles forgotten passwords until account recovery exists. */
export const FORGOT_PASSWORD_NOTICE = `Email ${product.supportEmail} from a different email address and include your Solace address. Solace does not reset passwords from the sign-in screen.`;

/** A session that cannot open the account key ends; signing in with the password opens it again. */
export const SIGN_IN_TO_UNLOCK_NOTICE =
  "Sign in again to open your encrypted data on this device.";

/** A device still signed in elsewhere repairs the envelope by changing the password, which rewraps it in the same step. */
export const UNLOCK_FAILED_NOTICE = `This device could not open your encrypted data with your password. If Solace is still open on another device, change your password there, then sign in here with the new one. Otherwise email ${product.supportEmail} from a different email address.`;

export function supportContactUrl(
  value: unknown = product.supportEmail,
): string | null {
  const email = z.string().trim().email().safeParse(value);
  return email.success ? `mailto:${email.data}` : null;
}

export function productLinks(appUrl: string | null) {
  let origin: string | null = null;
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
      ) {
        origin = url.origin;
      }
    } catch {
      origin = null;
    }
  }
  return {
    privacy: origin ? `${origin}${PRODUCT_ROUTES.privacy}` : null,
    support: origin ? `${origin}${PRODUCT_ROUTES.support}` : null,
    contact: supportContactUrl(),
  };
}
