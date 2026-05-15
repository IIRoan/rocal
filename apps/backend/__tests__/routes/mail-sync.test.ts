import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(
    async (): Promise<any> => ({
      id: "user-1",
      email: "alice@solace.onl",
      name: "Alice Example",
    }),
  ),
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-mail-sync-test" }),
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

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(createMailSyncRoutes(mockMailSyncService as any));
}

describe("mailSyncRoutes", () => {
  it("syncs mail changes for the authenticated user and requested account", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/sync?accountId=acct-1"),
    );

    expect(response.status).toBe(200);
    expect(mockMailSyncService.syncForUser).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        accountId: "acct-1",
        changedTypes: ["Email"],
      }),
    );
  });
});
