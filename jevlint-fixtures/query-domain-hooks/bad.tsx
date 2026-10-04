import { useQuery } from "@tanstack/react-query";

declare const eventQueryKeys: { list: () => readonly string[] };
declare const calendarApiService: {
  getEvents: () => Promise<{ title: string }[]>;
};

export function EventsPage() {
  const { data } = useQuery({
    queryKey: eventQueryKeys.list(),
    queryFn: () => calendarApiService.getEvents(),
  });
  return <span>{data?.length ?? 0}</span>;
}
