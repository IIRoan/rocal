function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  return [];
}

function normalizeAudienceClaim(
  audiences: string[],
): string | string[] | undefined {
  if (audiences.length === 0) {
    return undefined;
  }

  return audiences.length === 1 ? audiences[0] : audiences;
}

function buildProfileClaims(input: {
  user?: Record<string, unknown> | null;
  scopes: string[];
}): Record<string, unknown> {
  const user = input.user;
  if (!user) {
    return {};
  }

  const claims: Record<string, unknown> = {};
  const name = typeof user.name === "string" ? user.name.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const emailVerified =
    typeof user.emailVerified === "boolean" ? user.emailVerified : undefined;

  if (input.scopes.includes("email") && email) {
    claims.email = email;
    claims.email_verified = emailVerified ?? false;
  }

  if (input.scopes.includes("profile") && name) {
    claims.name = name;

    const nameParts = name.split(/\s+/).filter(Boolean);
    if (nameParts.length > 1) {
      claims.given_name = nameParts.slice(0, -1).join(" ");
      claims.family_name = nameParts[nameParts.length - 1];
    }
  }

  return claims;
}

export function buildMailOauthAccessTokenClaims(input: {
  user?: Record<string, unknown> | null;
  scopes: string[];
  resource?: string | string[];
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const resourceAudiences = normalizeStringArray(input.resource);
  const metadataAudiences = normalizeStringArray(input.metadata?.audiences);
  const audiences =
    resourceAudiences.length > 0 ? resourceAudiences : metadataAudiences;
  const aud = normalizeAudienceClaim(audiences);

  return {
    ...buildProfileClaims({
      user: input.user,
      scopes: input.scopes,
    }),
    ...(aud ? { aud } : {}),
  };
}

export function buildMailOauthUserInfoClaims(input: {
  defaultIssuer: string;
  scopes: string[];
  jwt: Record<string, unknown>;
}): Record<string, unknown> {
  const scopeClaim =
    typeof input.jwt.scope === "string" && input.jwt.scope.trim().length > 0
      ? input.jwt.scope
      : input.scopes.join(" ");
  const audienceClaim = normalizeAudienceClaim(
    normalizeStringArray(input.jwt.aud),
  );
  const authorizedParty =
    typeof input.jwt.azp === "string" && input.jwt.azp.trim().length > 0
      ? input.jwt.azp
      : typeof input.jwt.client_id === "string" &&
          input.jwt.client_id.trim().length > 0
        ? input.jwt.client_id
        : undefined;
  const issuer =
    typeof input.jwt.iss === "string" && input.jwt.iss.trim().length > 0
      ? input.jwt.iss
      : input.defaultIssuer;

  return {
    ...(scopeClaim ? { scope: scopeClaim } : {}),
    ...(audienceClaim ? { aud: audienceClaim } : {}),
    ...(authorizedParty ? { azp: authorizedParty } : {}),
    ...(issuer ? { iss: issuer } : {}),
  };
}
