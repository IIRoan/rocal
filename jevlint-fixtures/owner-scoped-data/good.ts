type EventRepository = {
  findFirst: (input: {
    where: { id: string; calendar: { userId: string } };
  }) => Promise<unknown>;
};

export function loadOwnedEvent(
  repository: EventRepository,
  session: { userId: string },
  eventId: string,
): Promise<unknown> {
  return repository.findFirst({
    where: { id: eventId, calendar: { userId: session.userId } },
  });
}
