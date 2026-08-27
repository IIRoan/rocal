export const sessionCookieAuthSecurity: Array<Record<string, string[]>> = [
  { secureSessionCookie: [] },
  { sessionCookie: [] },
];

export function authenticatedRouteDetail(tag: string) {
  return {
    detail: {
      tags: [tag],
      security: sessionCookieAuthSecurity,
    },
  };
}
