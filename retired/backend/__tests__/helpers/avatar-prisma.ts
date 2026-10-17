import { jest } from "@jest/globals";
import type { Prisma } from "../../generated/prisma/index.js";

interface AvatarState {
  id: string;
  avatarId: string | null;
  pendingAvatarId: string | null;
  image: string | null;
}

type AvatarTransaction = {
  user: {
    update: jest.Mock<(args: Prisma.UserUpdateArgs) => Promise<AvatarState>>;
  };
};

type AvatarPrisma = AvatarTransaction & {
  failNextCommit: Error | null;
  $transaction: jest.Mock<
    <T>(callback: (tx: AvatarTransaction) => Promise<T>) => Promise<T>
  >;
};

export function createAvatarPrisma(): {
  state: AvatarState;
  prisma: AvatarPrisma;
} {
  const state: AvatarState = {
    id: "user-1",
    avatarId: "previous",
    pendingAvatarId: null,
    image: "/api/profiles/avatars/previous",
  };
  const user = {
    update: jest.fn(async ({ data }: Prisma.UserUpdateArgs) => {
      for (const key of ["avatarId", "pendingAvatarId", "image"] as const) {
        const value = data[key];
        if (value !== undefined) {
          state[key] =
            typeof value === "object" && value !== null
              ? (value.set ?? null)
              : value;
        }
      }
      return { ...state };
    }),
  };
  let tail = Promise.resolve();
  const prisma: AvatarPrisma = {
    user,
    failNextCommit: null,
    $transaction: jest.fn(
      async <T>(callback: (tx: { user: typeof user }) => Promise<T>) => {
        const previous = tail;
        let release = () => {};
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        const snapshot = { ...state };
        try {
          const result = await callback({ user });
          if (prisma.failNextCommit) {
            const error = prisma.failNextCommit;
            prisma.failNextCommit = null;
            throw error;
          }
          return result;
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        } finally {
          release();
        }
      },
    ),
  };
  return { prisma, state };
}
