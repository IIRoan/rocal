export function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

export function getE2eeApiUrl(apiBaseUrl: string, path: string): string {
  return `${normalizeApiBaseUrl(apiBaseUrl)}/api/e2ee${path}`;
}
