import { describe, expect, it, jest } from "@jest/globals";
import { getStalwartMethodResult } from "../../lib/stalwart-mail-limits";
import { fetchStalwartMailServerLimits } from "../../lib/stalwart-mail-limits";

function createAdminClient(response: {
  methodResponses?: Array<[string, Record<string, unknown>, string]>;
}) {
  return {
    callJmap: jest.fn(async () => response),
  };
}

describe("fetchStalwartMailServerLimits", () => {
  it("reads Email and Jmap singleton limits from Stalwart", async () => {
    const adminClient = createAdminClient({
      methodResponses: [
        [
          "x:Email/get",
          {
            list: [
              {
                maxAttachmentSize: 100_000_000,
                maxMessageSize: 150_000_000,
              },
            ],
          },
          "e1",
        ],
        [
          "x:Jmap/get",
          {
            list: [{ maxUploadSize: 100_000_000 }],
          },
          "j1",
        ],
      ],
    });

    await expect(
      fetchStalwartMailServerLimits(adminClient as never),
    ).resolves.toEqual({
      maxBlobUploadBytes: 100_000_000,
      maxAttachmentSizeBytes: 100_000_000,
      maxMessageSizeBytes: 150_000_000,
    });

    expect(adminClient.callJmap).toHaveBeenCalledWith({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls: [
        [
          "x:Email/get",
          {
            ids: ["singleton"],
            properties: [
              "maxAttachmentSize",
              "maxMessageSize",
              "maxMailboxDepth",
              "maxMailboxNameLength",
              "maxMailboxes",
              "maxIdentities",
              "defaultFolders",
            ],
          },
          "email-limits",
        ],
        [
          "x:Jmap/get",
          {
            ids: ["singleton"],
            properties: [
              "maxUploadSize",
              "getMaxResults",
              "queryMaxResults",
              "maxMethodCalls",
              "maxConcurrentUploads",
              "maxRequestSize",
              "uploadTtl",
            ],
          },
          "jmap-limits",
        ],
      ],
    });
  });

  it("returns partial limits when singleton calls fail", async () => {
    const adminClient = createAdminClient({
      methodResponses: [
        ["x:Email/get", { notFound: { singleton: {} } }, "e1"],
        [
          "x:Jmap/get",
          {
            list: [{ maxUploadSize: "75mb" }],
          },
          "j1",
        ],
      ],
    });

    await expect(
      fetchStalwartMailServerLimits(adminClient as never),
    ).resolves.toEqual({
      maxBlobUploadBytes: 75_000_000,
      maxAttachmentSizeBytes: null,
      maxMessageSizeBytes: null,
    });
  });
});

describe("getStalwartMethodResult", () => {
  it("returns the matching method response payload", () => {
    expect(
      getStalwartMethodResult(
        {
          methodResponses: [
            ["Mailbox/get", { list: [] }, "c1"],
            ["x:Email/get", { list: [{ maxAttachmentSize: 1 }] }, "c2"],
          ],
        },
        "x:Email/get",
      ),
    ).toEqual({ list: [{ maxAttachmentSize: 1 }] });
  });
});
