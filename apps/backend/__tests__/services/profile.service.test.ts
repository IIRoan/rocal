import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/safe-fetch", () => {
  const actual = jest.requireActual<typeof import("../../lib/safe-fetch")>(
    "../../lib/safe-fetch",
  );
  return { ...actual, safeFetch: jest.fn() };
});

jest.mock("../../lib/avatar-storage", () => ({
  storeAvatar: jest.fn(),
  readAvatar: jest.fn(),
  deleteAvatar: jest.fn(),
}));

import {
  deleteAvatar,
  readAvatar,
  storeAvatar,
} from "../../lib/avatar-storage";
import { ValidationError } from "../../lib/errors";
import { SafeFetchError, safeFetch } from "../../lib/safe-fetch";
import { createAvatarPrisma } from "../helpers/avatar-prisma";
import { ProfileService } from "../../services/profile.service";

const mockSafeFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;
const storage = {
  put: storeAvatar as jest.MockedFunction<typeof storeAvatar>,
  get: readAvatar as jest.MockedFunction<typeof readAvatar>,
  delete: deleteAvatar as jest.MockedFunction<typeof deleteAvatar>,
};
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString(
  "base64",
);

describe("ProfileService", () => {
  const user = {
    findFirst: jest.fn<(...args: unknown[]) => Promise<any>>(),
    findUnique: jest.fn<(...args: unknown[]) => Promise<any>>(),
    update: jest.fn<(...args: unknown[]) => Promise<any>>(),
  };
  const prisma = {
    user,
    $transaction: jest.fn(
      async (callback: (tx: { user: typeof user }) => Promise<unknown>) =>
        callback({ user }),
    ),
  };
  const service = new ProfileService(prisma as never);

  beforeEach(() => {
    prisma.user.findFirst.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.user.update.mockReset().mockResolvedValue({ avatarId: null });
    storage.put.mockReset().mockResolvedValue(undefined);
    storage.get.mockReset();
    storage.delete.mockReset().mockResolvedValue(undefined);
    mockSafeFetch.mockReset();
  });

  it("returns same-origin avatar proxy paths for matching Solace users", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      avatarId: null,
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

  it("returns opaque uploaded-avatar paths for users with a stored picture", async () => {
    const avatarId = "a".repeat(22);
    prisma.user.findFirst.mockResolvedValueOnce({
      avatarId,
      image: `/api/profiles/avatars/${avatarId}`,
    });

    await expect(service.lookup(["alice@example.com"])).resolves.toEqual({
      profiles: [
        {
          email: "alice@example.com",
          image: `/api/profiles/avatars/${avatarId}`,
        },
      ],
    });
  });

  it("streams avatar bytes for a known Solace user", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      avatarId: null,
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

  it("streams uploaded avatars from storage instead of the network", async () => {
    const avatarId = "b".repeat(22);
    prisma.user.findFirst.mockResolvedValueOnce({
      avatarId,
      image: `/api/profiles/avatars/${avatarId}`,
    });
    storage.get.mockResolvedValueOnce(new Uint8Array([9, 9, 9]));

    await expect(service.streamAvatar("alice@example.com")).resolves.toEqual({
      body: new Uint8Array([9, 9, 9]),
      contentType: "image/webp",
    });
    expect(storage.get).toHaveBeenCalledWith(avatarId, 512);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("serves the smallest stored variant that covers the requested size", async () => {
    const avatarId = "f".repeat(22);
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    storage.get.mockResolvedValueOnce(new Uint8Array([1]));

    await service.streamUploadedAvatar(avatarId, 80);

    expect(storage.get).toHaveBeenCalledWith(avatarId, 128);
  });

  it("returns null when a referenced variant is missing from storage", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user-1" });
    storage.get.mockResolvedValueOnce(null);

    await expect(
      service.streamUploadedAvatar("g".repeat(22), 32),
    ).resolves.toBeNull();
  });

  it("refuses to stream uploaded avatars that no account references", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.streamUploadedAvatar("c".repeat(22)),
    ).resolves.toBeNull();
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns null when the avatar host is blocked by the SSRF policy", async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      email: "alice@example.com",
      image: "https://cdn.example.com/alice.png",
      avatarId: null,
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

  describe("avatar changes", () => {
    let db: ReturnType<typeof createAvatarPrisma>;
    let avatars: Set<string>;
    let profile: ProfileService;

    beforeEach(() => {
      db = createAvatarPrisma();
      avatars = new Set(["previous"]);
      profile = new ProfileService(db.prisma as never);
      storage.put.mockImplementation(async (id) => {
        avatars.add(id);
        expect(avatars.size).toBeLessThanOrEqual(2);
      });
      storage.delete.mockImplementation(async (id) => {
        avatars.delete(id);
      });
    });

    const upload = () =>
      profile.uploadAvatar({ userId: "user-1", image: JPEG_BASE64 });

    it("uploads the first picture without leaving a pending slot", async () => {
      db.state.avatarId = null;
      db.state.image = null;
      avatars.clear();
      const result = await upload();
      expect(db.state.image).toBe(result.image);
      expect(db.state.pendingAvatarId).toBeNull();
      expect(avatars).toEqual(new Set([db.state.avatarId]));
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it("keeps the current picture until the replacement commits", async () => {
      storage.put.mockImplementationOnce(async (id) => {
        expect(db.state.avatarId).toBe("previous");
        expect(avatars.has("previous")).toBe(true);
        avatars.add(id);
        expect(avatars.size).toBe(2);
      });
      storage.delete.mockImplementationOnce(async (id) => {
        expect(db.state.avatarId).not.toBe("previous");
        expect(db.state.pendingAvatarId).toBe("previous");
        avatars.delete(id);
      });
      const result = await upload();
      expect(result.image).toMatch(
        /^\/api\/profiles\/avatars\/[A-Za-z0-9_-]{22}$/,
      );
      expect(db.state.image).toBe(result.image);
      expect(db.state.pendingAvatarId).toBeNull();
      expect(avatars).toEqual(new Set([db.state.avatarId]));
    });

    it("keeps the old picture when validation rejects the replacement", async () => {
      storage.put.mockRejectedValueOnce(
        new ValidationError("bad image", "image"),
      );
      await expect(upload()).rejects.toBeInstanceOf(ValidationError);
      expect(db.state.avatarId).toBe("previous");
      expect(avatars).toEqual(new Set(["previous"]));
      expect(storage.delete).not.toHaveBeenCalledWith("previous");
    });

    it("cleans partial uploads without touching the current picture", async () => {
      storage.put.mockImplementationOnce(async (id) => {
        avatars.add(id);
        throw new Error("write failed");
      });
      await expect(upload()).rejects.toThrow("write failed");
      expect(db.state.avatarId).toBe("previous");
      expect(avatars).toEqual(new Set(["previous"]));
    });

    it("cleans the replacement after a commit failure", async () => {
      storage.put.mockImplementationOnce(async (id) => {
        avatars.add(id);
        db.prisma.failNextCommit = new Error("commit failed");
      });
      await expect(upload()).rejects.toThrow("commit failed");
      expect(db.state.avatarId).toBe("previous");
      expect(avatars).toEqual(new Set(["previous"]));
    });

    it("preserves the current picture when the database update fails", async () => {
      storage.put.mockImplementationOnce(async (id) => {
        avatars.add(id);
        db.prisma.user.update.mockRejectedValueOnce(new Error("update failed"));
      });
      await expect(upload()).rejects.toThrow("update failed");
      expect(db.state.avatarId).toBe("previous");
      expect(avatars).toEqual(new Set(["previous"]));
    });

    it("cleans an interrupted upload before storing another picture", async () => {
      db.state.pendingAvatarId = "interrupted";
      avatars.add("interrupted");
      await upload();
      expect(storage.delete).toHaveBeenCalledWith("interrupted");
      expect(avatars).toEqual(new Set([db.state.avatarId]));
    });

    it("retains failed cleanup and refuses a third photo until cleanup succeeds", async () => {
      storage.delete.mockRejectedValue(new Error("delete failed"));
      await expect(upload()).resolves.toEqual({ image: expect.any(String) });
      expect(db.state.pendingAvatarId).toBe("previous");
      expect(avatars.size).toBe(2);
      await expect(upload()).rejects.toThrow("delete failed");
      expect(storage.put).toHaveBeenCalledTimes(1);
      storage.delete.mockImplementation(async (id) => {
        avatars.delete(id);
      });
      const firstId = db.state.avatarId;
      await upload();
      expect(db.state.avatarId).not.toBe(firstId);
      expect(db.state.pendingAvatarId).toBeNull();
      expect(avatars).toEqual(new Set([db.state.avatarId]));
    });

    it("remembers failed upload cleanup without masking the upload error", async () => {
      storage.put.mockImplementationOnce(async (id) => {
        avatars.add(id);
        throw new Error("write failed");
      });
      storage.delete.mockRejectedValue(new Error("delete failed"));
      await expect(upload()).rejects.toThrow("write failed");
      expect(db.state.avatarId).toBe("previous");
      expect(db.state.pendingAvatarId).not.toBeNull();
      expect(avatars.size).toBe(2);
      await expect(upload()).rejects.toThrow("delete failed");
      expect(storage.put).toHaveBeenCalledTimes(1);
    });

    it("serializes competing uploads without leaving extra pictures", async () => {
      const results = await Promise.allSettled([upload(), upload()]);
      expect(results.some((result) => result.status === "fulfilled")).toBe(
        true,
      );
      expect(avatars).toEqual(new Set([db.state.avatarId]));
      expect(db.state.pendingAvatarId).toBeNull();
    });

    it("removes the reference before deleting objects and retries failed cleanup", async () => {
      storage.delete.mockRejectedValueOnce(new Error("delete failed"));
      await expect(profile.removeAvatar({ userId: "user-1" })).resolves.toEqual(
        { image: null },
      );
      expect(db.state.avatarId).toBeNull();
      expect(db.state.pendingAvatarId).toBe("previous");
      await profile.removeAvatar({ userId: "user-1" });
      expect(avatars.size).toBe(0);
      expect(db.state.pendingAvatarId).toBeNull();
    });

    it("keeps the current objects when removal fails to commit", async () => {
      db.prisma.failNextCommit = new Error("commit failed");
      await expect(profile.removeAvatar({ userId: "user-1" })).rejects.toThrow(
        "commit failed",
      );
      expect(db.state.avatarId).toBe("previous");
      expect(avatars).toEqual(new Set(["previous"]));
    });
  });
});
