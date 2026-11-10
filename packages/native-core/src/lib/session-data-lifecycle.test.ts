import {
  activateSessionData,
  captureSessionDataScope,
  closeSessionData,
  createSessionDataStore,
  isSessionDataScopeCurrent,
  suspendSessionData,
} from "./session-data-lifecycle";

function deferred() {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("session data lifecycle", () => {
  beforeEach(async () => {
    await closeSessionData().catch(() => undefined);
    activateSessionData("u1");
  });

  it("makes terminal close win against an already-started physical write", async () => {
    const started = deferred();
    const finish = deferred();
    const files: string[] = [];
    const store = createSessionDataStore(async () => {
      files.length = 0;
    });
    const request = store.capture("u1");
    const write = store.run(request.isCurrent, async () => {
      started.resolve();
      await finish.promise;
      files.push("old");
    });
    await started.promise;
    const closing = closeSessionData();
    expect(request.isCurrent()).toBe(false);
    finish.resolve();
    await Promise.all([write, closing]);
    expect(files).toEqual([]);
  });

  it("rejects debounced work from a previous login to the same account", async () => {
    const old = captureSessionDataScope("u1");
    await closeSessionData();
    activateSessionData("u1");
    expect(isSessionDataScopeCurrent(old)).toBe(false);
    expect(captureSessionDataScope("u1")).not.toBe(old);
  });

  it("attempts independent cleanup and retries a failed wipe before writing", async () => {
    const cleanup = jest
      .fn()
      .mockRejectedValueOnce(new Error("disk busy"))
      .mockResolvedValue(undefined);
    const first = createSessionDataStore(cleanup);
    const otherCleanup = jest.fn(async () => undefined);
    createSessionDataStore(otherCleanup);
    await expect(closeSessionData()).rejects.toThrow("Cleanup will retry");
    expect(otherCleanup).toHaveBeenCalledTimes(1);
    activateSessionData("u2");
    const request = first.capture("u2");
    const write = jest.fn(async () => "new");
    await expect(first.run(request.isCurrent, write)).resolves.toBe("new");
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("suspends without wiping, then permits a new active scope", async () => {
    const cleanup = jest.fn(async () => undefined);
    const store = createSessionDataStore(cleanup);
    const request = store.capture("u1");
    suspendSessionData();
    expect(request.isCurrent()).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();
    activateSessionData("u1");
    const next = store.capture("u1");
    await expect(
      store.run(next.isCurrent, async () => "resumed"),
    ).resolves.toBe("resumed");
  });
});
