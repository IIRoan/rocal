import { z } from "./zod";
import product from "./product-info.json";

export const PRODUCT_ROUTES = {
  privacy: product.privacyPath,
  support: product.supportPath,
  licenses: product.licensesPath,
} as const;

export const PRODUCT_ISSUES_URL = product.issuesUrl;

export const PRODUCT_SOURCE_URL = product.sourceUrl;

/** AGPL-3.0 asks that users of the running service can find its source. */
export const PRODUCT_LICENSE_NOTICE =
  "Solace is free software: you can use, study, share and change it under the GNU Affero General Public License, version 3. Its source code is public.";

/** Without a recovery kit, support is the only way back into an account. */
export const FORGOT_PASSWORD_NOTICE = `No recovery kit? Email ${product.supportEmail} from a different email address and include your Solace address.`;

/** Shown beside a new recovery key, which the server cannot replace or read back. */
export const RECOVERY_KIT_NOTICE =
  "Keep this key somewhere safe. Anyone with it and your email can reset your password.";

/** After a recovery the used kit is gone, so the next sign-in asks for a new one. */
export const RECOVERY_KIT_USED_NOTICE =
  "Your recovery kit was used up. Create a new one in Settings, under Security.";

/** A session that cannot open the account key ends; signing in with the password opens it again. */
export const SIGN_IN_TO_UNLOCK_NOTICE =
  "Sign in again to open your encrypted data on this device.";

/** A device still signed in elsewhere repairs the envelope by changing the password, which rewraps it in the same step. */
export const UNLOCK_FAILED_NOTICE = `This device could not open your encrypted data with your password. If Solace is still open on another device, change your password there, then sign in here with the new one. Otherwise email ${product.supportEmail} from a different email address.`;

export function supportContactUrl(
  value: unknown = product.supportEmail,
): string | null {
  const email = z.string().trim().pipe(z.email()).safeParse(value);
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
