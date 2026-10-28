export function GET(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "https://mail.solace.onl/admin/",
      "Cache-Control": "no-store",
    },
  });
}
