import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { QUERY_KEYS } from "./query-keys";
import { resetPreSessionQueries } from "./session-query-reset";

describe("resetPreSessionQueries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("refetches into a mounted observer whose pre-session fetch was still in flight", async () => {
    const eventsKey = QUERY_KEYS.events("2026-09-01", "2026-10-01");
    const responses = [new Promise<string[]>(() => undefined), Promise.resolve(["evt-1"])];
    const queryFn = jest.fn(() => responses.shift() ?? Promise.resolve([]));
    const observer = new QueryObserver(queryClient, { queryKey: eventsKey, queryFn });
    const seen: (string[] | undefined)[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));

    await resetPreSessionQueries(queryClient);

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toEqual(["evt-1"]);
    unsubscribe();
  });

  it("clears unobserved event, calendar and category data without refetching it", async () => {
    const monthKey = QUERY_KEYS.events("2026-11-01", "2026-12-01");
    queryClient.setQueryData(monthKey, ["stale"]);
    queryClient.setQueryData(QUERY_KEYS.calendars(), ["cal"]);
    queryClient.setQueryData(QUERY_KEYS.categories(), ["cat"]);
    queryClient.setQueryData(QUERY_KEYS.settings(), { timezone: "UTC" });

    await resetPreSessionQueries(queryClient);

    expect(queryClient.getQueryData(monthKey)).toBeUndefined();
    expect(queryClient.getQueryData(QUERY_KEYS.calendars())).toBeUndefined();
    expect(queryClient.getQueryData(QUERY_KEYS.categories())).toBeUndefined();
    expect(queryClient.getQueryData(QUERY_KEYS.settings())).toEqual({ timezone: "UTC" });
  });
});
