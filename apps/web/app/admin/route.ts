export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  const configured = process.env.STALWART_ADMIN_URL;
  if (!configured) return new Response(null, { status: 404, headers });
  let target: URL;
  try {
    target = new URL(configured);
  } catch {
    return new Response(null, { status: 503, headers });
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    (target.protocol !== "https:" && !(local && target.protocol === "http:")) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !["/admin", "/admin/"].includes(target.pathname)
  )
    return new Response(null, { status: 503, headers });
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      Location: target.href,
    },
  });
}
