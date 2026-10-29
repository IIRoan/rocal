import { z } from "zod";
import product from "./product-info.json";

export const PRODUCT_ROUTES = {
  privacy: product.privacyPath,
  support: product.supportPath,
} as const;

export const PRODUCT_ISSUES_URL = product.issuesUrl;

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
