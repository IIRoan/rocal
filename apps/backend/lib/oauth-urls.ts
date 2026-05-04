export function normalizeUrlForJoin(url: string): string {
  return url.replace(/\/+$/, "");
}

export function normalizePathForJoin(path: string): string {
  const trimmed = path.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

export function getOAuthProviderCallbackUrl(
  baseUrl: string,
  basePath: string,
  providerId: string,
): string {
  return `${normalizeUrlForJoin(baseUrl)}${normalizePathForJoin(basePath)}/callback/${providerId}`;
}
