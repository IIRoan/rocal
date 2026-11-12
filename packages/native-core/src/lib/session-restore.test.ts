import { restoreWithTimeout } from "./session-restore";

describe("restoreWithTimeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reports a slow restore as late without cancelling it", async () => {
    let finish: () => void = () => undefined;
    const applied = jest.fn();
    const restore = restoreWithTimeout(
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
    await expect(restore.inTime).resolves.toBe(false);
    finish();
    await expect(restore.settled).resolves.toBe(true);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("leaves cancellation to the caller's predicate", async () => {
    let finish: () => void = () => undefined;
    let retired = false;
    const restore = restoreWithTimeout(
      async (isCancelled) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return !isCancelled();
      },
      () => retired,
    );
    await jest.advanceTimersByTimeAsync(1_500);
    retired = true;
    finish();
    await expect(restore.settled).resolves.toBe(false);
  });

  it("returns the same result in time and clears the timeout", async () => {
    const restore = restoreWithTimeout(async () => true, () => false);
    await expect(restore.inTime).resolves.toBe(true);
    await expect(restore.settled).resolves.toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ["rejects", async () => { throw new Error("Storage unavailable"); }],
    ["throws synchronously", () => { throw new Error("Storage unavailable"); }],
  ])("falls back when storage %s", async (_case, restore: () => Promise<boolean>) => {
    const result = restoreWithTimeout(restore, () => false);
    await expect(result.inTime).resolves.toBe(false);
    await expect(result.settled).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
