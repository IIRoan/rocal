const DEFAULT_DISCOVERY_SIGNING_ALGS = ["EdDSA"] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveJwksUri(metadata: Record<string, unknown>): string | null {
  if (isNonEmptyString(metadata.jwks_uri)) {
    return metadata.jwks_uri;
  }

  if (!isNonEmptyString(metadata.issuer)) {
    return null;
  }

  return new URL("jwks", `${metadata.issuer.replace(/\/+$/, "")}/`).toString();
}

function isOpenIdConfiguration(metadata: Record<string, unknown>): boolean {
  return isNonEmptyString(metadata.userinfo_endpoint);
}

function shouldReplaceSigningAlgorithms(metadata: Record<string, unknown>): boolean {
  const algorithms = metadata.id_token_signing_alg_values_supported;

  if (!Array.isArray(algorithms)) {
    return true;
  }

  const normalizedAlgorithms = algorithms.filter(isNonEmptyString);

  if (normalizedAlgorithms.length === 0) {
    return true;
  }

  return normalizedAlgorithms.length === 1 && normalizedAlgorithms[0] === "HS256";
}

export function ensureCompatibleOauthMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const patchedMetadata = { ...metadata };
  const jwksUri = resolveJwksUri(patchedMetadata);

  if (jwksUri) {
    patchedMetadata.jwks_uri = jwksUri;
  }

  if (
    jwksUri &&
    isOpenIdConfiguration(patchedMetadata) &&
    shouldReplaceSigningAlgorithms(patchedMetadata)
  ) {
    patchedMetadata.id_token_signing_alg_values_supported = [
      ...DEFAULT_DISCOVERY_SIGNING_ALGS,
    ];
  }

  return patchedMetadata;
}

export async function patchOauthMetadataResponse(
  response: Response,
): Promise<Response> {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    return response;
  }

  const metadata = (await response.json()) as Record<string, unknown>;
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(ensureCompatibleOauthMetadata(metadata)), {
    status: response.status,
    headers,
  });
}