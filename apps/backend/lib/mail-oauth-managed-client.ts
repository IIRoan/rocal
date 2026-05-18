type ManagedMailOauthClientMetadata = {
  audiences: string[];
  issuer: string;
};

export type ManagedMailOauthClientInput = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  clientSecret?: string;
  postLogoutRedirectUris?: string[];
  type: "web" | "user-agent-based";
  tokenEndpointAuthMethod: "client_secret_basic" | "none";
  enableEndSession?: boolean;
};

export type ManagedMailOauthClientRecord = {
  clientId: string;
  clientSecret: string | null;
  name: string | null;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tokenEndpointAuthMethod: string | null;
  grantTypes: string[];
  responseTypes: string[];
  type: string | null;
  skipConsent: boolean | null;
  enableEndSession: boolean | null;
  metadata: unknown;
};

export type ManagedMailOauthClientState = {
  clientId: string;
  clientSecret: string | null;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tokenEndpointAuthMethod: "client_secret_basic" | "none";
  grantTypes: ["authorization_code", "refresh_token"];
  responseTypes: ["code"];
  type: "web" | "user-agent-based";
  skipConsent: true;
  enableEndSession: boolean;
  metadata: ManagedMailOauthClientMetadata;
};

function normalizeStringArray(values: string[]) {
  return [...values].sort();
}

function normalizeMetadata(metadata: unknown) {
  if (typeof metadata === "string") {
    try {
      return normalizeMetadata(JSON.parse(metadata));
    } catch {
      return metadata;
    }
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata ?? null;
  }

  const entries = Object.entries(metadata as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
        return [key, normalizeStringArray(value)];
      }

      return [key, value];
    });

  return Object.fromEntries(entries);
}

export function buildManagedMailOauthClientState(input: {
  client: ManagedMailOauthClientInput;
  audiences: string[];
  issuer: string;
}): ManagedMailOauthClientState {
  return {
    clientId: input.client.clientId,
    clientSecret: input.client.clientSecret ?? null,
    name: input.client.clientName,
    redirectUris: input.client.redirectUris,
    postLogoutRedirectUris: input.client.postLogoutRedirectUris ?? [],
    tokenEndpointAuthMethod: input.client.tokenEndpointAuthMethod,
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    type: input.client.type,
    skipConsent: true,
    enableEndSession: input.client.enableEndSession ?? false,
    metadata: {
      audiences: input.audiences,
      issuer: input.issuer,
    },
  };
}

export function managedMailOauthClientNeedsUpdate(input: {
  existing: ManagedMailOauthClientRecord;
  desired: ManagedMailOauthClientState;
}) {
  const { existing, desired } = input;

  return (
    existing.clientSecret !== desired.clientSecret ||
    existing.name !== desired.name ||
    JSON.stringify(normalizeStringArray(existing.redirectUris)) !==
      JSON.stringify(normalizeStringArray(desired.redirectUris)) ||
    JSON.stringify(normalizeStringArray(existing.postLogoutRedirectUris)) !==
      JSON.stringify(normalizeStringArray(desired.postLogoutRedirectUris)) ||
    existing.tokenEndpointAuthMethod !== desired.tokenEndpointAuthMethod ||
    JSON.stringify(normalizeStringArray(existing.grantTypes)) !==
      JSON.stringify(normalizeStringArray(desired.grantTypes)) ||
    JSON.stringify(normalizeStringArray(existing.responseTypes)) !==
      JSON.stringify(normalizeStringArray(desired.responseTypes)) ||
    existing.type !== desired.type ||
    existing.skipConsent !== desired.skipConsent ||
    existing.enableEndSession !== desired.enableEndSession ||
    JSON.stringify(normalizeMetadata(existing.metadata)) !==
      JSON.stringify(normalizeMetadata(desired.metadata))
  );
}
