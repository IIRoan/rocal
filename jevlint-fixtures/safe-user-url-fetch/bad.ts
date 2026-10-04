export function fetchRemoteCalendar(url: string): Promise<Response> {
  return fetch(url);
}
