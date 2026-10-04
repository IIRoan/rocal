type EventInput = { calendarId: string; start: string; end: string };

type RouteContext = {
  auth: { session: () => Promise<{ userId: string }> };
  body: unknown;
  services: {
    event: {
      create: (userId: string, input: EventInput) => Promise<{ id: string }>;
    };
  };
  routeModel: { createBody: { parse: (value: unknown) => EventInput } };
  json: (data: { id: string }) => Response;
};

export async function createEventHandler(c: RouteContext): Promise<Response> {
  const session = await c.auth.session();
  const input = c.routeModel.createBody.parse(c.body);
  const event = await c.services.event.create(session.userId, input);
  return c.json({ id: event.id });
}
