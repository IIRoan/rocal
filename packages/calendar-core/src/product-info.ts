import { z } from "zod";
import product from "./product-info.json";

export const PRODUCT_ROUTES = {
  privacy: product.privacyPath,
  support: product.supportPath,
} as const;

export const PRODUCT_ISSUES_URL = product.issuesUrl;

/** Support handles forgotten passwords until account recovery exists. */
export const FORGOT_PASSWORD_NOTICE = `Email ${product.supportEmail} from a different email address and include your Solace address. Solace does not reset passwords from the sign-in screen.`;

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
