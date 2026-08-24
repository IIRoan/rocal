import { describe, expect, it, jest } from "@jest/globals";

import { createSolaceProfileLookupBatcher } from "../solace-profile-lookup";

describe("createSolaceProfileLookupBatcher", () => {
  it("batches concurrent lookups into one request", async () => {
    const lookup = jest.fn(async (emails: string[]) => ({
      profiles:
        emails.includes("alice@example.com")
          ? [
              {
                email: "alice@example.com",
                image: "https://cdn.example.com/alice.png",
              },
            ]
          : [],
    }));
    const batcher = createSolaceProfileLookupBatcher(lookup);

    const [alice, bob] = await Promise.all([
      batcher.get("Alice@Example.com"),
      batcher.get("bob@example.com"),
    ]);

    expect(alice).toBe("https://cdn.example.com/alice.png");
    expect(bob).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith([
      "alice@example.com",
      "bob@example.com",
    ]);
  });
});
