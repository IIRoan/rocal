import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth-guard", () => {
  const { createMockRequireAuth } =
    jest.requireActual<typeof import("../helpers/mock-require-auth")>(
      "../helpers/mock-require-auth",
    );
  return {
    requireAuth: createMockRequireAuth(),
  };
});

import { errorHandler } from "../../lib/errors";
import { createRealtimeMailRoutes } from "../../routes/realtime-mail";

const unsubscribe = jest.fn();

const mockRealtimeService = {
  subscribe: jest.fn(() => unsubscribe),
};

const mockMailSyncService = {
  listAuthorizedAccountIdsForUser: jest.fn(async () => ["acct-1"]),
  detectChanges: jest.fn(),
  syncForUser: jest.fn(),
};

function createApp(heartbeatIntervalMs = 10) {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(
      createRealtimeMailRoutes({
        realtimeService: mockRealtimeService as any,
        mailSyncService: mockMailSyncService as any,
        heartbeatIntervalMs,
      }),
    );
}

describe("realtimeMailRoutes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("streams keepalives and avoids per-client polling work", async () => {
    const setIntervalSpy = jest.spyOn(globalThis, "setInterval");
    const abortController = new AbortController();
    const response = await createApp().handle(
      new Request("http://localhost/realtime/mail", {
        signal: abortController.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(
      mockMailSyncService.listAuthorizedAccountIdsForUser,
    ).toHaveBeenCalledWith("user-1");
    expect(mockRealtimeService.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        accountIds: ["acct-1"],
        subscriberId: expect.any(String),
        onEvent: expect.any(Function),
      }),
    );
    expect(mockMailSyncService.detectChanges).not.toHaveBeenCalled();
    expect(mockMailSyncService.syncForUser).not.toHaveBeenCalled();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10);

    abortController.abort();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
