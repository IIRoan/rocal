declare const calendarApiService: {
  getEvents: () => Promise<unknown[]>;
};

export function loadEvents(): Promise<unknown[]> {
  return calendarApiService.getEvents();
}
