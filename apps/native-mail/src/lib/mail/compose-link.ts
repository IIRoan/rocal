/** Bare hosts get https, so "solace.onl" links where the writer meant it to. */
export function normalizeComposeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return `https://${trimmed}`;
}
