import type { QueryClient, QueryKey } from "@tanstack/react-query";

export async function cancelMailMessageReads(
  queryClient: QueryClient,
  roots: readonly QueryKey[],
): Promise<() => Promise<void>> {
  const cache = queryClient.getQueryCache();
  const interrupted = new Map(
    roots
      .flatMap((queryKey) =>
        cache.findAll({ queryKey, fetchStatus: "fetching" }),
      )
      .map(
        (query) =>
          [query.queryHash, { query, meta: query.state.fetchMeta }] as const,
      ),
  );
  await Promise.all(
    roots.map((queryKey) => queryClient.cancelQueries({ queryKey })),
  );
  return async () => {
    await Promise.all(
      [...interrupted.values()].map(({ query, meta }) => {
        if (
          cache.get(query.queryHash) !== query ||
          !query.isActive() ||
          query.isDisabled()
        )
          return Promise.resolve();
        // Restoring fetchMore metadata resumes an interrupted next page instead of reloading only earlier pages.
        const fetch = query
          .fetch(undefined, { cancelRefetch: false, meta: meta ?? undefined })
          .then(
            () => undefined,
            () => undefined,
          );
        return query.state.fetchStatus === "paused" ? Promise.resolve() : fetch;
      }),
    );
  };
}
