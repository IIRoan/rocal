import { beforeEach, expect, it, jest } from "@jest/globals";
import type { Prisma } from "../../generated/prisma/index.js";
import { deleteAvatar } from "../../lib/avatar-storage";
import { withLegacyAvatarCleanup } from "../../lib/avatar-updates";
import { createAvatarPrisma } from "../helpers/avatar-prisma";

jest.mock("../../lib/avatar-storage", () => ({ deleteAvatar: jest.fn() }));

type UpdateInput = {
  args: Prisma.UserUpdateArgs;
  query: (args: Prisma.UserUpdateArgs) => Promise<unknown>;
};
const extend = jest.fn(
  (extension: {
    query: { user: { update: (input: UpdateInput) => Promise<unknown> } };
  }) => extension,
);
let db: ReturnType<typeof createAvatarPrisma>;
const query = jest.fn(async () => ({}));
function update(args: Prisma.UserUpdateArgs) {
  withLegacyAvatarCleanup(
    Object.assign(db.prisma, { $extends: extend }) as never,
  );
  const extension = extend.mock.calls.at(-1)?.[0];
  if (!extension) throw new Error("Missing legacy avatar adapter");
  return extension.query.user.update({ args, query });
}
beforeEach(() => {
  db = createAvatarPrisma();
  query.mockClear();
  jest.mocked(deleteAvatar).mockReset().mockResolvedValue(undefined);
});

it("deletes an uploaded picture only after the legacy replacement commits", async () => {
  jest.mocked(deleteAvatar).mockImplementationOnce(async () => {
    expect(db.state.image).toBe("https://example.test/new.jpg");
    expect(db.state.avatarId).toBeNull();
  });
  await update({
    where: { id: "user-1" },
    data: { image: { set: "https://example.test/new.jpg" } },
  });
  expect(deleteAvatar).toHaveBeenCalledWith("previous");
  expect(db.state.pendingAvatarId).toBeNull();
  expect(query).not.toHaveBeenCalled();
});

it("clears the uploaded reference on legacy removal", async () => {
  await update({ where: { id: "user-1" }, data: { image: null } });
  expect(deleteAvatar).toHaveBeenCalledWith("previous");
  expect(db.state).toMatchObject({
    image: null,
    avatarId: null,
    pendingAvatarId: null,
  });
});

it("preserves the old objects when a legacy update fails to commit", async () => {
  db.prisma.failNextCommit = new Error("commit failed");
  await expect(
    update({ where: { id: "user-1" }, data: { image: null } }),
  ).rejects.toThrow("commit failed");
  expect(db.state.avatarId).toBe("previous");
  expect(deleteAvatar).not.toHaveBeenCalled();
});

it("retains cleanup after a legacy removal when storage is unavailable", async () => {
  jest.mocked(deleteAvatar).mockRejectedValueOnce(new Error("delete failed"));
  await update({ where: { id: "user-1" }, data: { image: null } });
  expect(db.state).toMatchObject({
    image: null,
    avatarId: null,
    pendingAvatarId: "previous",
  });
  await update({ where: { id: "user-1" }, data: { image: null } });
  expect(db.state.pendingAvatarId).toBeNull();
});

it("preserves an unchanged image and skips cleanup for name-only updates", async () => {
  await update({
    where: { id: "user-1" },
    data: { image: "/api/profiles/avatars/previous" },
  });
  expect(deleteAvatar).not.toHaveBeenCalled();
  expect(db.state.avatarId).toBe("previous");
  await update({ where: { id: "user-1" }, data: { name: "Changed" } });
  expect(query).toHaveBeenCalledTimes(1);
  expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
});
