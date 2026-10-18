import { auth } from "./auth";

export async function getRequestAuthSession(
  request: Request,
  responseHeaders: Record<string, unknown>,
  query?: { disableCookieCache: boolean },
) {
  const { headers, response: session } = await auth.api.getSession({
    headers: request.headers,
    ...(query ? { query } : {}),
    returnHeaders: true,
  });
  const cookies: string[] = headers.getSetCookie();
  if (cookies.length > 0) {
    const existing = responseHeaders["set-cookie"];
    responseHeaders["set-cookie"] = [
      ...(typeof existing === "string"
        ? [existing]
        : Array.isArray(existing)
          ? existing
          : []),
      ...cookies,
    ];
  }
  return session;
}
