import { mergeConversationSourceMessages } from "./conversation-thread";
import type { JmapEmailMessage } from "./types";

function message(partial: Partial<JmapEmailMessage> & { id: string }): JmapEmailMessage {
  return { ...partial };
}

describe("mergeConversationSourceMessages", () => {
  it("preserves loaded body values when later metadata lacks them", () => {
    const merged = mergeConversationSourceMessages(
      [
        message({
          id: "m1",
          receivedAt: "2026-05-19T10:00:00.000Z",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Secret" } },
        }),
      ],
      [
        message({
          id: "m1",
          receivedAt: "2026-05-19T10:00:00.000Z",
          subject: "Updated",
          bodyStructure: { type: "text/plain", blobId: "b1" },
        }),
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.subject).toBe("Updated");
    expect(merged[0]?.bodyValues?.text?.value).toBe("Secret");
  });
});
