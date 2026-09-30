/** Merges loads requested in the same tick into one `loadMany` call, so N parallel queries cost one round trip. */
export function createBatchLoader<V>(
  loadMany: (keys: string[]) => Promise<Map<string, V>>,
  fallback: V,
): (key: string) => Promise<V> {
  let queued = new Set<string>();
  let flush: Promise<Map<string, V>> | null = null;

  return async (key) => {
    queued.add(key);
    flush ??= Promise.resolve().then(() => {
      const keys = [...queued];
      queued = new Set();
      flush = null;
      return loadMany(keys);
    });
    return (await flush).get(key) ?? fallback;
  };
}
