type CalendarApiService = {
  createEvent: (request: {
    title: string;
    description: string;
  }) => Promise<unknown>;
};

export function createEventThroughEncryptedClient(
  api: CalendarApiService,
  title: string,
  description: string,
): Promise<unknown> {
  return api.createEvent({ title, description });
}
