import { describe, expect, it, jest } from "@jest/globals";
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
import { createMailSyncRoutes } from "../../routes/mail-sync";

const mockMailSyncService = {
  syncForUser: jest.fn(async () => ({
    accountId: "acct-1",
    initialized: false,
    changedTypes: ["Email"],
    email: {
      oldState: "email-old",
      newState: "email-new",
      created: ["msg-1"],
      updated: [],
      destroyed: [],
      records: [],
    },
    mailbox: {
      oldState: "mailbox-old",
      newState: "mailbox-new",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
    thread: {
      oldState: "thread-old",
      newState: "thread-new",
      created: [],
      updated: [],
      destroyed: [],
      records: [],
    },
  })),
};

describe("mailSyncRoutes", () => {
  it("syncs mail changes for the authenticated user and requested account", async () => {
    const onInboundMail = jest.fn(async () => undefined);
    const response = await new Elysia({ normalize: false })
      .use(errorHandler)
      .use(createMailSyncRoutes(mockMailSyncService as any, onInboundMail))
      .handle(new Request("http://localhost/mail/sync?accountId=acct-1"));

    expect(response.status).toBe(200);
    expect(mockMailSyncService.syncForUser).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
    });
    expect(onInboundMail).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        userId: "user-1",
        sync: expect.objectContaining({
          accountId: "acct-1",
          email: expect.objectContaining({ created: ["msg-1"] }),
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        accountId: "acct-1",
        changedTypes: ["Email"],
      }),
    );
  });
});
