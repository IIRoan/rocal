import { useQuery } from "@tanstack/react-query";

declare const eventQueryKeys: { list: () => readonly string[] };
declare const calendarApiService: {
  getEvents: () => Promise<{ title: string }[]>;
};

export function useEvents() {
  return useQuery({
    queryKey: eventQueryKeys.list(),
    queryFn: () => calendarApiService.getEvents(),
  });
}
