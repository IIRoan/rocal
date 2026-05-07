import { z } from "zod";

export const SOLACE_EMAIL_LOCAL_PART_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

const emailSchema = z.string().email();

export type NormalizedDesiredSolaceEmail = {
  localPart: string;
  normalizedEmail: string;
  domain: string;
};

export type InvalidDesiredSolaceEmail = {
  localPart: string | null;
  normalizedEmail: string;
  domain: string;
  message: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLocalPart(value: string): string {
  return value.trim().toLowerCase();
}

export function buildSolaceEmailAddress(localPart: string, domain: string): string {
  return `${normalizeLocalPart(localPart)}@${normalizeEmail(domain)}`;
}

export function normalizeDesiredSolaceEmailInput(
  value: string,
  defaultDomain: string,
):
  | { success: true; value: NormalizedDesiredSolaceEmail }
  | { success: false; error: InvalidDesiredSolaceEmail } {
  const domain = normalizeEmail(defaultDomain);
  const normalizedValue = normalizeEmail(value);

  if (!normalizedValue) {
    return {
      success: false,
      error: {
        localPart: null,
        normalizedEmail: normalizedValue,
        domain,
        message: `Choose your @${domain} email address.`,
      },
    };
  }

  if (!normalizedValue.includes("@")) {
    if (!SOLACE_EMAIL_LOCAL_PART_PATTERN.test(normalizedValue)) {
      return {
        success: false,
        error: {
          localPart: normalizedValue,
          normalizedEmail: normalizedValue,
          domain,
          message:
            "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.",
        },
      };
    }

    return {
      success: true,
      value: {
        localPart: normalizedValue,
        normalizedEmail: buildSolaceEmailAddress(normalizedValue, domain),
        domain,
      },
    };
  }

  if (!emailSchema.safeParse(normalizedValue).success) {
    return {
      success: false,
      error: {
        localPart: null,
        normalizedEmail: normalizedValue,
        domain,
        message: `Enter a valid @${domain} email address.`,
      },
    };
  }

  const separatorIndex = normalizedValue.lastIndexOf("@");
  const localPart = normalizedValue.slice(0, separatorIndex);
  const inputDomain = normalizedValue.slice(separatorIndex + 1);

  if (inputDomain !== domain) {
    return {
      success: false,
      error: {
        localPart,
        normalizedEmail: normalizedValue,
        domain,
        message: `Use your @${domain} email address for Solace sign-up.`,
      },
    };
  }

  if (!SOLACE_EMAIL_LOCAL_PART_PATTERN.test(localPart)) {
    return {
      success: false,
      error: {
        localPart,
        normalizedEmail: normalizedValue,
        domain,
        message:
          "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.",
      },
    };
  }

  return {
    success: true,
    value: {
      localPart,
      normalizedEmail: normalizedValue,
      domain,
    },
  };
}