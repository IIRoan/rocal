import { describe, expect, it } from "@jest/globals";
import {
  mergeMailMessage,
  messageHasLoadedBody,
} from "@/lib/mail/mail-message-body";
import type { JmapEmailMessage } from "@/lib/mail/types";

function previewMessage(id: string): JmapEmailMessage {
  return {
    id,
    subject: "Hello",
    preview: "Snippet",
    hasAttachment: true,
  };
}

function fullMessage(id: string): JmapEmailMessage {
  return {
    id,
    subject: "Hello",
    textBody: [{ partId: "text", type: "text/plain" }],
    bodyValues: { text: { value: "Body" } },
  };
}

describe("mail-message-body", () => {
  it("detects when a message body has been loaded", () => {
    expect(messageHasLoadedBody(previewMessage("m1"))).toBe(false);
    expect(messageHasLoadedBody(fullMessage("m1"))).toBe(true);
  });

  it("preserves loaded bodies when merging preview refreshes", () => {
    const merged = mergeMailMessage(fullMessage("m1"), {
      ...previewMessage("m1"),
      subject: "Updated subject",
    });

    expect(merged.subject).toBe("Updated subject");
    expect(merged.bodyValues?.text?.value).toBe("Body");
  });

  it("replaces preview rows with full-body fetches", () => {
    const merged = mergeMailMessage(previewMessage("m1"), fullMessage("m1"));
    expect(merged.bodyValues?.text?.value).toBe("Body");
  });
});
