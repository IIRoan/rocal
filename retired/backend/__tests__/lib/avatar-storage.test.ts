import { afterEach, expect, it, jest } from "@jest/globals";
import { storeAvatar } from "../../lib/avatar-storage";

jest.mock("../../lib/env", () => ({
  env: {
    avatarBucket: {
      name: "test",
      endpoint: "https://bucket.test",
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  },
}));

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Bun");
});

it("waits for outstanding variant writes before reporting a failed upload", async () => {
  let finishWrite: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  const write = jest
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("upload failed"))
    .mockReturnValueOnce(pending)
    .mockResolvedValue(undefined);
  class Image {
    metadata = async () => ({ width: 512, height: 512 });
    resize() {
      return this;
    }
    webp() {
      return this;
    }
    bytes = async () => new Uint8Array([1]);
  }
  Reflect.set(globalThis, "Bun", {
    Image,
    S3Client: class {
      write = write;
    },
  });
  let settled = false;
  const result = storeAvatar("avatar", new Uint8Array([1])).catch(
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  finishWrite();
  await expect(result).resolves.toMatchObject({ message: "upload failed" });
});
