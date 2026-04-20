export const bearerAuthSecurity = [{ bearerAuth: [] }] as const;

export function authenticatedRouteDetail(tag: string) {
  return {
    detail: {
      tags: [tag],
      security: bearerAuthSecurity,
    },
  };
}
