import { trimTrailingSlashes } from "@workspace/runtime";
import type { JmapSession } from "./mail-jmap-types";

function rewriteOrigin(
  urlString: string | undefined,
  baseUrl: string,
): string | undefined {
  if (!urlString) {
    return undefined;
  }

  try {
    const original = new URL(urlString);
    const replacement = new URL(baseUrl);
    const replacementPath = trimTrailingSlashes(replacement.pathname);
    return `${replacement.origin}${replacementPath}${urlString.slice(original.origin.length)}`;
  } catch {
    return urlString;
  }
}

export function buildBearerAuthHeader(accessToken: string): string {
  return `Bearer ${accessToken.trim()}`;
}

export function normalizeJmapSession(
  session: JmapSession,
  discoveryBaseUrl: string,
): JmapSession {
  const normalizedBaseUrl = trimTrailingSlashes(discoveryBaseUrl);

  return {
    ...session,
    apiUrl: `${normalizedBaseUrl}/jmap/`,
    downloadUrl: rewriteOrigin(session.downloadUrl, normalizedBaseUrl),
    uploadUrl: rewriteOrigin(session.uploadUrl, normalizedBaseUrl),
    eventSourceUrl: rewriteOrigin(session.eventSourceUrl, normalizedBaseUrl),
  };
}

export function getPrimaryMailAccountId(
  session: Pick<JmapSession, "accounts" | "primaryAccounts">,
): string | null {
  return (
    session.primaryAccounts["urn:ietf:params:jmap:mail"] ||
    session.primaryAccounts["urn:stalwart:jmap"] ||
    Object.keys(session.accounts)[0] ||
    null
  );
}

export function getSubmissionAccountId(
  session: JmapSession,
  mailAccountId: string,
): string {
  return (
    session.primaryAccounts["urn:ietf:params:jmap:submission"] ?? mailAccountId
  );
}
