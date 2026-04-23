import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: jest.fn(),
    },
  },
}));

import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import {
  API_DOCS_ALLOWED_EMAIL,
  createApiDocsErrorBody,
  getApiDocsAccess,
} from "../../lib/docs-access";

const mockGetSession = auth.api.getSession as jest.MockedFunction<
  typeof auth.api.getSession
>;
const mockFindFirst = prisma.account.findFirst as jest.MockedFunction<
  typeof prisma.account.findFirst
>;

describe("getApiDocsAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires authentication when no session user is present", async () => {
    mockGetSession.mockResolvedValue(undefined as never);

    await expect(
      getApiDocsAccess(new Request("http://localhost/docs")),
    ).resolves.toEqual({
      allowed: false,
      status: 401,
      title: "Authentication required",
      message: expect.stringContaining("Sign in with GitHub OAuth"),
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("rejects authenticated users whose email is not on the allow list", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "other@example.com",
      },
    } as never);

    await expect(
      getApiDocsAccess(new Request("http://localhost/docs")),
    ).resolves.toEqual({
      allowed: false,
      status: 403,
      title: "Access restricted",
      message: `These docs are limited to the GitHub account ${API_DOCS_ALLOWED_EMAIL}.`,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("accepts the approved email case-insensitively and requires a linked github account", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: API_DOCS_ALLOWED_EMAIL.toUpperCase(),
      },
    } as never);
    mockFindFirst.mockResolvedValue(null as never);

    await expect(
      getApiDocsAccess(new Request("http://localhost/docs")),
    ).resolves.toEqual({
      allowed: false,
      status: 403,
      title: "GitHub OAuth required",
      message: expect.stringContaining("attached GitHub OAuth account"),
    });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        providerId: "github",
      },
      select: {
        id: true,
      },
    });
  });

  it("allows access for the approved github-backed user", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: API_DOCS_ALLOWED_EMAIL,
      },
    } as never);
    mockFindFirst.mockResolvedValue({ id: "acct-1" } as never);

    await expect(
      getApiDocsAccess(new Request("http://localhost/docs")),
    ).resolves.toEqual({ allowed: true });
  });

  it("falls back to authentication required when session lookup throws", async () => {
    mockGetSession.mockRejectedValue(new Error("session unavailable") as never);

    await expect(
      getApiDocsAccess(new Request("http://localhost/docs")),
    ).resolves.toEqual({
      allowed: false,
      status: 401,
      title: "Authentication required",
      message: expect.stringContaining("reload the API docs"),
    });
  });
});

describe("createApiDocsErrorBody", () => {
  it("maps 401 results to an Unauthorized payload", () => {
    const body = createApiDocsErrorBody({
      allowed: false,
      status: 401,
      title: "Authentication required",
      message: "Sign in first.",
    });

    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBe("Sign in first.");
    expect(body.statusCode).toBe(401);
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it("maps 403 results to a Forbidden payload", () => {
    const body = createApiDocsErrorBody({
      allowed: false,
      status: 403,
      title: "Access restricted",
      message: "Nope.",
    });

    expect(body.error).toBe("Forbidden");
    expect(body.message).toBe("Nope.");
    expect(body.statusCode).toBe(403);
    expect(body.timestamp).toEqual(expect.any(String));
  });
});
