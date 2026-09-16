import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/safe-fetch", () => {
  const actual = jest.requireActual<typeof import("../../lib/safe-fetch")>(
    "../../lib/safe-fetch",
  );
  return { ...actual, safeFetch: jest.fn() };
});

import { SafeFetchError, safeFetch } from "../../lib/safe-fetch";
import { ProfileService } from "../../services/profile.service";

const mockSafeFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;

describe("ProfileService", () => {
  const prisma = {
    user: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<any>>(),
    },
  };
  const service = new ProfileService(prisma as never);

  beforeEach(() => {
    prisma.user.findFirst.mockReset();
    mockSafeFetch.mockReset();
  });

  it("returns same-origin avatar proxy paths for matching Solace users", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      mailDirectoryEntry: { email: "alice@example.com" },
    });

    await expect(
      service.lookup([
        "Alice@Example.com",
        "mallory@example.com",
        "unknown@example.com",
      ]),
    ).resolves.toEqual({
      profiles: [
        {
          email: "alice@example.com",
          image: "/api/profiles/avatar?email=alice%40example.com",
        },
      ],
    });
  });

  it("streams avatar bytes for a known Solace user", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      mailDirectoryEntry: null,
    });

    mockSafeFetch.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    await expect(service.streamAvatar("alice@example.com")).resolves.toEqual({
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    expect(mockSafeFetch).toHaveBeenCalledWith(
      "https://cdn.example.com/alice.png",
      expect.objectContaining({ maxBytes: 2 * 1024 * 1024 }),
    );
  });

  it("returns null when the avatar host is blocked by the SSRF policy", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      mailDirectoryEntry: null,
    });
    mockSafeFetch.mockRejectedValueOnce(
      new SafeFetchError("private-network-host"),
    );

    await expect(service.streamAvatar("alice@example.com")).resolves.toBeNull();
  });

  it("returns an empty list when no emails are usable", async () => {
    await expect(service.lookup(["", "not-an-email"])).resolves.toEqual({
      profiles: [],
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
