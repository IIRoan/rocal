import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    ok: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    skip: jest.fn(),
    step: jest.fn(),
    child: jest.fn(),
  }),
}));

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(),
}));

import { EventService } from "../../services/event.service";

describe("EventService.search", () => {
  it("does not keep plaintext match-all clauses when the trimmed query is blank", async () => {
    const queryRawUnsafe = jest.fn<
      (sql: string, ...params: Array<string | number | Date>) => Promise<any[]>
    >(async () => []);
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);
    const prisma = {
      $queryRawUnsafe: queryRawUnsafe,
    };

    const service = new EventService(prisma as never);

    await service.search({
      userId: "user-1",
      query: "  ",
      blindIndexTokens: ["idx-1"],
    });

    const resultsSql = prisma.$queryRawUnsafe.mock.calls[0]?.[0] as string;
    const countSql = prisma.$queryRawUnsafe.mock.calls[1]?.[0] as string;

    expect(resultsSql).toContain("FALSE");
    expect(resultsSql).not.toContain("OR e.title ILIKE '%' || $2 || '%'");
    expect(countSql).toContain("FALSE");
    expect(countSql).not.toContain("OR e.title ILIKE '%' || $2 || '%'");
  });
});
