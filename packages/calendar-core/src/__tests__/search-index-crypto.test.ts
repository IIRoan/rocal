import { describe, expect, it } from "@jest/globals";
import {
  decryptSearchShard,
  encryptSearchShard,
  exportLocalSearchIndexKey,
  generateLocalSearchIndexKey,
  importLocalSearchIndexKey,
} from "../search-index-crypto";

describe("private search shard crypto", () => {
  it("round-trips a title shard without storing plaintext", async () => {
    const key = await generateLocalSearchIndexKey();
    const payload = {
      documents: [{ id: "calendar:1", title: "Private planning" }],
    };

    const shard = await encryptSearchShard(key, payload, {
      additionalData: "calendar:user-1",
      itemCount: 1,
    });

    expect(JSON.stringify(shard)).not.toContain("Private planning");
    await expect(
      decryptSearchShard<typeof payload>(key, shard, {
        additionalData: "calendar:user-1",
      }),
    ).resolves.toEqual(payload);
  });

  it("rejects shards when authenticated data does not match", async () => {
    const key = await generateLocalSearchIndexKey();
    const shard = await encryptSearchShard(
      key,
      { id: "mail:1" },
      { additionalData: "mail:account-1" },
    );

    await expect(
      decryptSearchShard(key, shard, { additionalData: "mail:other" }),
    ).rejects.toThrow();
  });

  it("exports and reimports extractable keys", async () => {
    const key = await generateLocalSearchIndexKey({ extractable: true });
    const exported = await exportLocalSearchIndexKey(key);
    const imported = await importLocalSearchIndexKey(exported);
    const shard = await encryptSearchShard(imported, { ok: true });

    await expect(decryptSearchShard(imported, shard)).resolves.toEqual({
      ok: true,
    });
  });
});
