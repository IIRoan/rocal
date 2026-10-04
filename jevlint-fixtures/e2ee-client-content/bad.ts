type ApiClient = {
  post: (path: string, payload: Record<string, unknown>) => Promise<unknown>;
};

export function createEventInPlaintext(
  api: ApiClient,
  title: string,
  description: string,
): Promise<unknown> {
  return api.post("/api/events", { title, description });
}
