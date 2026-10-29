import settings from "../../../../../packages/native-core/expo-apps.json";

export function GET(): Response {
  const team = process.env.SOLACE_APPLE_TEAM_ID?.trim();
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(
    {
      webcredentials: {
        apps: Object.values(settings.apps).map(
          (app) => `${team}.${app.bundleIdentifier}`,
        ),
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
