import { describe, expect, it } from "@jest/globals";
import {
  parseJmapBlobUploadResponse,
  parseSendMessageResults,
} from "../../src/mail-jmap-validation";

describe("mail JMAP zod validation", () => {
  it("parses blob upload responses with expected size", () => {
    expect(
      parseJmapBlobUploadResponse(
        { blobId: "blob-1", size: 12, type: "text/plain" },
        12,
        "note.txt",
      ),
    ).toEqual({
      blobId: "blob-1",
      size: 12,
      type: "text/plain",
    });
  });

  it("rejects blob upload responses without a blob id", () => {
    expect(() =>
      parseJmapBlobUploadResponse({ size: 12 }, 12, "note.txt"),
    ).toThrow("note.txt did not return a blob id");
  });

  it("parses send message created records", () => {
    expect(
      parseSendMessageResults({
        emailSet: {
          created: {
            draft1: { id: "email-1", threadId: "thread-1" },
          },
        },
        emailSubmissionSet: {
          created: {
            s1: { id: "submission-1" },
          },
        },
      }),
    ).toEqual({
      emailId: "email-1",
      threadId: "thread-1",
      submissionId: "submission-1",
    });
  });

  it("rejects send results without a submission id", () => {
    expect(() =>
      parseSendMessageResults({
        emailSet: {
          created: {
            draft1: { id: "email-1" },
          },
        },
        emailSubmissionSet: {
          created: {},
        },
      }),
    ).toThrow("not submitted for delivery");
  });
});
