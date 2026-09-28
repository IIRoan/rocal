const RESTORE_TIMEOUT_MS = 1_500;

/** Expired or superseded restores must not apply data after startup moves on. */
export async function restoreWithTimeout(
  restore: (isCancelled: () => boolean) => Promise<boolean>,
  isCancelled: () => boolean,
): Promise<boolean> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      restore(() => expired || isCancelled()),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve(false);
        }, RESTORE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}
