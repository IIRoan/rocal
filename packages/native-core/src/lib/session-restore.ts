const RESTORE_TIMEOUT_MS = 1_500;

/** The budget only decides the first render; the caller's predicate, never expiry, cancels a restore that finishes later. */
export function restoreWithTimeout(
  restore: (isCancelled: () => boolean) => Promise<boolean>,
  isCancelled: () => boolean,
): { inTime: Promise<boolean>; settled: Promise<boolean> } {
  const settled = (async () => restore(isCancelled))().catch(() => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inTime = Promise.race([
    settled,
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), RESTORE_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  return { inTime, settled };
}
