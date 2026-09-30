import { createBatchLoader } from "./batch-loader";

describe("createBatchLoader", () => {
  it("serves loads from the same tick with one call", async () => {
    const loadMany = jest.fn(
      async (keys: string[]) => new Map(keys.map((key) => [key, key.toUpperCase()])),
    );
    const load = createBatchLoader(loadMany, "");

    const results = await Promise.all([load("a"), load("b"), load("a")]);

    expect(results).toEqual(["A", "B", "A"]);
    expect(loadMany).toHaveBeenCalledTimes(1);
    expect(loadMany).toHaveBeenCalledWith(["a", "b"]);
  });

  it("starts a fresh batch for later loads instead of reusing old results", async () => {
    let version = 0;
    const loadMany = jest.fn(
      async (keys: string[]) =>
        new Map(keys.map((key) => [key, `${key}${(version += 1)}`])),
    );
    const load = createBatchLoader(loadMany, "");

    expect(await load("a")).toBe("a1");
    expect(await load("a")).toBe("a2");
    expect(loadMany).toHaveBeenCalledTimes(2);
  });

  it("falls back for keys the batch did not return", async () => {
    const load = createBatchLoader(async () => new Map<string, string[]>(), []);
    expect(await load("missing")).toEqual([]);
  });

  it("rejects every caller in a failed batch and recovers afterwards", async () => {
    const loadMany = jest
      .fn<Promise<Map<string, string>>, [string[]]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Map([["a", "ok"]]));
    const load = createBatchLoader(loadMany, "");

    const settled = await Promise.allSettled([load("a"), load("b")]);
    expect(settled.map((entry) => entry.status)).toEqual(["rejected", "rejected"]);
    expect(await load("a")).toBe("ok");
  });
});
