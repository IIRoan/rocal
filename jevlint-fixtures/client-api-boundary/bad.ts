export async function loadEvents(): Promise<unknown> {
  const response = await fetch("/api/events");
  return response.json();
}
