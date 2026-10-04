declare function useQuery<T>(options: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled: boolean;
}): { data: T | undefined };
declare const eventQueryKeys: { list: readonly ["events", "list"] };
declare const calendarApiService: { getEvents: () => Promise<unknown[]> };

export function useEvents(enabled: boolean) {
  return useQuery({
    queryKey: eventQueryKeys.list,
    queryFn: () => calendarApiService.getEvents(),
    enabled,
  });
}
