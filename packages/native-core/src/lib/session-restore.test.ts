import { restoreWithTimeout } from "./session-restore";

describe("restoreWithTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("cancels slow restores before startup continues", async () => {
    let finish: () => void = () => undefined;
    const applied = jest.fn();
    const restored = restoreWithTimeout(
      async (isCancelled) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        if (isCancelled()) return false;
        applied();
        return true;
      },
      () => false,
    );

    await jest.advanceTimersByTimeAsync(1_500);
    await expect(restored).resolves.toBe(false);
    finish();
    await Promise.resolve();
    expect(applied).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("passes session cancellation through to the restore", async () => {
    let cancelled = false;
    const restored = restoreWithTimeout(
      async (isCancelled) => {
        cancelled = true;
        return !isCancelled();
      },
      () => cancelled,
    );
    await expect(restored).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("clears the timeout after a successful restore", async () => {
    await expect(
      restoreWithTimeout(
        async () => true,
        () => false,
      ),
    ).resolves.toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("falls back when storage fails", async () => {
    await expect(
      restoreWithTimeout(
        async () => {
          throw new Error("Storage unavailable");
        },
        () => false,
      ),
    ).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
