declare function safeFetch(rawUrl: string): Promise<Response>;

export function fetchRemoteCalendar(url: string): Promise<Response> {
  return safeFetch(url);
}
