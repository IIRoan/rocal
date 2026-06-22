import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {},
}));

jest.mock("../../lib/passkey-step-up", () => ({
  hasVerifiedPasskeyStepUp: jest.fn(() => false),
  getPasskeyStepUpStatus: jest.fn(async () => ({
    hasPasskeys: false,
    isPasskeyStepUpVerified: false,
    requiresPasskeyStepUp: false,
  })),
}));

const mockMailService = {
  getConfig: jest.fn(),
  issueAccessTokenForUser: jest.fn(async () => ({
    access_token: "stalwart-access-token",
    expires_in: 1800,
    expires_at: 1779149999,
  })),
  getAccessTokenForUser: jest.fn(async () => ({
    access_token: "stalwart-access-token",
    expires_in: 1800,
    expires_at: 1779149999,
  })),
  invalidateAccessTokenForUser: jest.fn(),
  getDirectoryKey: jest.fn(),
  getMailboxStatusForUser: jest.fn(),
  bootstrapForUser: jest.fn(),
  getVaultBackup: jest.fn(),
  getVaultBackupForUser: jest.fn(),
  upsertVaultBackup: jest.fn(),
  upsertVaultBackupForUser: jest.fn(),
  deleteMailboxForUser: jest.fn(),
};

import { auth } from "../../lib/auth";
import { errorHandler } from "../../lib/errors";
import {
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
} from "../../lib/passkey-step-up";
import type { IMailService } from "../../contracts/mail.contract";
import { createMailRoutes } from "../../routes/mail";

const mockGetSession = jest.mocked(auth.api.getSession);
const mockGetPasskeyStepUpStatus = jest.mocked(getPasskeyStepUpStatus);
const mockHasVerifiedPasskeyStepUp = jest.mocked(hasVerifiedPasskeyStepUp);

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(createMailRoutes(mockMailService as unknown as IMailService));
}

async function readJson(response: Response) {
  return response.json();
}

describe("mailRoutes passkey step-up", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "alice@solace.onl" },
      session: { id: "session-1", userId: "user-1" },
    } as never);
    mockHasVerifiedPasskeyStepUp.mockReturnValue(false);
    mockGetPasskeyStepUpStatus.mockResolvedValue({
      hasPasskeys: true,
      isPasskeyStepUpVerified: false,
      requiresPasskeyStepUp: false,
    });
  });

  it("blocks vault-key-material when passkey step-up is required", async () => {
    mockGetPasskeyStepUpStatus.mockResolvedValue({
      hasPasskeys: true,
      isPasskeyStepUpVerified: false,
      requiresPasskeyStepUp: true,
    });

    const response = await createApp().handle(
      new Request("http://localhost/mail/vault-key-material", {
        headers: {
          cookie: "better-auth.session_token=session-token",
        },
      }),
    );

    expect(mockGetPasskeyStepUpStatus).toHaveBeenCalled();
    expect(response.status).not.toBe(200);
    await expect(response.text()).resolves.toContain(
      "Passkey verification required.",
    );
  });

  it("returns a mail token when passkey step-up is satisfied", async () => {
    const response = await createApp().handle(
      new Request("http://localhost/mail/oauth/access-token", {
        headers: {
          cookie: "better-auth.session_token=session-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetPasskeyStepUpStatus).toHaveBeenCalled();
    expect(mockMailService.getAccessTokenForUser).toHaveBeenCalledWith({
      userId: "user-1",
      email: "alice@solace.onl",
    });
    await expect(readJson(response)).resolves.toEqual({
      access_token: "stalwart-access-token",
      expires_in: 1800,
      expires_at: 1779149999,
    });
  });
});
