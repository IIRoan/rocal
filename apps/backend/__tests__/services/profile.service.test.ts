import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ProfileService } from "../../services/profile.service";

describe("ProfileService", () => {
  const prisma = {
    user: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<any>>(),
    },
  };
  const service = new ProfileService(prisma as never);

  beforeEach(() => {
    prisma.user.findFirst.mockReset();
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

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    ) as unknown as typeof fetch;

    try {
      await expect(service.streamAvatar("alice@example.com")).resolves.toEqual({
        body: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns an empty list when no emails are usable", async () => {
    await expect(service.lookup(["", "not-an-email"])).resolves.toEqual({
      profiles: [],
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
