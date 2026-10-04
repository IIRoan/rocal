type EventRepository = {
  findUnique: (input: { where: { id: string } }) => Promise<unknown>;
};

export function loadEventById(
  repository: EventRepository,
  session: { userId: string },
  eventId: string,
): Promise<unknown> {
  return repository.findUnique({ where: { id: eventId } });
}
