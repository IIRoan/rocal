import { describe, expect, it } from "@jest/globals";
import {
  decryptSearchShard,
  encryptSearchShard,
  generateLocalSearchIndexKey,
} from "../../lib/search/local-index-store";

describe("local private search index shards", () => {
  it("encrypts and decrypts shard payloads without storing plaintext", async () => {
    const key = await generateLocalSearchIndexKey();
    const payload = {
      documents: [
        {
          id: "mail:1",
          title: "Private launch plan",
          body: "Search content stays local",
        },
      ],
    };

    const shard = await encryptSearchShard(key, payload, {
      additionalData: "mail:account-1",
      itemCount: 1,
    });

    expect(JSON.stringify(shard)).not.toContain("Private launch plan");
    expect(shard.itemCount).toBe(1);
    await expect(
      decryptSearchShard<typeof payload>(key, shard, {
        additionalData: "mail:account-1",
      }),
    ).resolves.toEqual(payload);
  });

  it("rejects shards when authenticated data does not match", async () => {
    const key = await generateLocalSearchIndexKey();
    const shard = await encryptSearchShard(
      key,
      { id: "calendar:event-1" },
      { additionalData: "calendar:user-1" },
    );

    await expect(
      decryptSearchShard(key, shard, {
        additionalData: "calendar:other-user",
      }),
    ).rejects.toThrow();
  });
});
