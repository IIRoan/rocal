import { describe, expect, it } from "@jest/globals";
import {
  mergeMailMessage,
  mergeMailMessagePreservingKeywords,
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

  it("does not treat bodyStructure-only list metadata as a loaded body", () => {
    expect(
      messageHasLoadedBody({
        id: "m1",
        preview: "-----BEGIN PGP MESSAGE-----\nwV4D",
        bodyStructure: {
          type: "text/plain",
          blobId: "blob-1",
        },
      }),
    ).toBe(false);
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

  it("keeps loaded bodies when merging bodyStructure-only metadata", () => {
    const merged = mergeMailMessage(fullMessage("m1"), {
      id: "m1",
      subject: "List refresh",
      bodyStructure: { type: "text/plain", blobId: "b1" },
    });

    expect(merged.subject).toBe("List refresh");
    expect(merged.bodyValues?.text?.value).toBe("Body");
    expect(merged.bodyStructure).toBeUndefined();
  });

  it("preserves local keywords when a body fetch would clear $seen", () => {
    const local = {
      ...previewMessage("m1"),
      keywords: { $seen: true, $flagged: true },
    };
    const incoming = {
      ...fullMessage("m1"),
      keywords: { $flagged: true },
    };

    const merged = mergeMailMessagePreservingKeywords(local, incoming);

    expect(merged.bodyValues?.text?.value).toBe("Body");
    expect(merged.keywords).toEqual({ $seen: true, $flagged: true });
  });

  it("preserves local unread when a stale body fetch still has $seen", () => {
    const local = {
      ...previewMessage("m1"),
      keywords: { $flagged: true },
    };
    const incoming = {
      ...fullMessage("m1"),
      keywords: { $seen: true, $flagged: true },
    };

    const merged = mergeMailMessagePreservingKeywords(local, incoming);

    expect(merged.keywords).toEqual({ $flagged: true });
  });
});
