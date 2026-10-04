type EventRow = { calendarId: string; start: string; ownerId: string };

type EventInput = { calendarId: string; start: string; end: string };

type RouteContext = {
  auth: { session: () => Promise<{ userId: string }> };
  body: { event: EventInput };
  db: {
    event: {
      findMany: (q: {
        where: { calendarId: string; start: string };
      }) => Promise<EventRow[]>;
      create: (q: {
        data: EventInput & { ownerId: string };
      }) => Promise<{ id: string }>;
    };
    auditLog: {
      create: (q: {
        data: { userId: string; action: string };
      }) => Promise<void>;
    };
  };
  json: (data: { id: string }) => Response;
};

export async function createEventHandler(c: RouteContext): Promise<Response> {
  const session = await c.auth.session();
  const input = c.body.event;
  const conflicts = await c.db.event.findMany({
    where: { calendarId: input.calendarId, start: input.start },
  });
  if (conflicts.length > 0) {
    throw new Error("conflict");
  }
  const event = await c.db.event.create({
    data: { ...input, ownerId: session.userId },
  });
  await c.db.auditLog.create({
    data: { userId: session.userId, action: "event.create" },
  });
  return c.json({ id: event.id });
}
