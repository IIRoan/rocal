/** Better Auth's fetch with every password swapped for its auth key, so the API never receives a password. */

type DeriveAuthKey = (password: string, email: string) => Promise<string>;
type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type PasswordRoute = { current?: string; next?: string };

const PASSWORD_ROUTES: Record<string, PasswordRoute> = {
  "/sign-in/email": { current: "password" },
  "/sign-up/email": { next: "password" },
  "/change-password": { current: "currentPassword", next: "newPassword" },
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function routeFor(input: string | URL | Request): PasswordRoute | null {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const { pathname } = new URL(url, "http://localhost");
  const match = Object.keys(PASSWORD_ROUTES).find((path) =>
    pathname.endsWith(path),
  );
  return match ? (PASSWORD_ROUTES[match] ?? null) : null;
}

function parseBody(
  body: RequestInit["body"] | undefined,
): Record<string, unknown> | null {
  if (typeof body !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? { ...parsed }
      : null;
  } catch {
    return null;
  }
}

function errorResponse(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

/** The API only sees the key, so a new password gets its length rules here, with the API's own errors. */
function lengthError(password: unknown): Response | null {
  if (typeof password !== "string") return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse("PASSWORD_TOO_SHORT", "Password too short");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse("PASSWORD_TOO_LONG", "Password too long");
  }
  return null;
}

/** A hash from before auth keys can only be checked against the raw password, which the API then replaces with a key hash. */
async function isUpgradeRequired(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "PASSWORD_UPGRADE_REQUIRED"
  );
}

export function createAuthKeyFetch(
  deriveAuthKey: DeriveAuthKey,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
): Fetch {
  return async (input, init) => {
    const route = routeFor(input);
    const body = route ? parseBody(init?.body) : null;
    if (!route || !body) return fetchImpl(input, init);

    const rejected = route.next ? lengthError(body[route.next]) : null;
    if (rejected) return rejected;

    const email = typeof body.email === "string" ? body.email : "";
    const keyed = { ...body };
    for (const field of [route.current, route.next]) {
      const value = field ? body[field] : undefined;
      if (field && typeof value === "string") {
        keyed[field] = await deriveAuthKey(value, email);
      }
    }
    const send = (next: Record<string, unknown>) =>
      fetchImpl(input, { ...init, body: JSON.stringify(next) });

    const response = await send(keyed);
    if (!route.current || !(await isUpgradeRequired(response))) {
      return response;
    }
    return send({ ...keyed, [route.current]: body[route.current] });
  };
}
