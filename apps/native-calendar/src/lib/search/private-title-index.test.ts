import { rebuildNativeTitleIndex } from "./private-title-index";

let mockGeneration = 0;
const mockLoad = jest.fn<Promise<[]>, []>();
const mockCommit = jest.fn();
jest.mock("@workspace/calendar-client", () => ({ loadEventSearchCorpus: () => mockLoad() }));
jest.mock("@workspace/native-core/lib/api", () => ({ calendarApiService: {} }));
jest.mock("@workspace/native-core/lib/search/title-index-store", () => ({
  captureNativeTitleIndexRequest: () => { const startedAt = mockGeneration; return { isCurrent: () => startedAt === mockGeneration }; },
  loadNativeTitleIndex: async () => [],
  saveNativeTitleIndex: async (input: { request: { isCurrent: () => boolean } }) => { if (!input.request.isCurrent()) return false; mockCommit(); return true; },
}));

describe("Calendar private index collection lifetime", () => {
  beforeEach(() => { mockLoad.mockReset(); mockCommit.mockClear(); mockGeneration += 1; });
  it("does not commit collection that finished after invalidation", async () => {
    let finish = () => undefined as void;
    mockLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve([]); }));
    const result = rebuildNativeTitleIndex({ accountId: "u1" });
    mockGeneration += 1;
    finish();
    await expect(result).rejects.toThrow("cancelled");
    expect(mockCommit).not.toHaveBeenCalled();
  });
  it("allows a fresh collection after invalidation", async () => {
    mockLoad.mockResolvedValue([]);
    expect(await rebuildNativeTitleIndex({ accountId: "u1" })).toEqual([]);
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });
});
