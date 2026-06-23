import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { StalwartJmapClient } from "../../lib/mail/jmap-client";
import {
  appendMailboxMessages,
  hasMoreMailboxMessages,
  MAILBOX_MESSAGES_PAGE_SIZE,
} from "../../lib/mail/mail-pagination";
import type { JmapSession } from "../../lib/mail/types";

const mockSession: JmapSession = {
  apiUrl: "https://mail.example.com/jmap/",
  downloadUrl: undefined,
  uploadUrl: undefined,
  eventSourceUrl: undefined,
  accounts: { acc1: {} as never },
  primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
};

function makeMessage(id: string) {
  return {
    id,
    receivedAt: new Date().toISOString(),
    keywords: {},
    mailboxIds: {},
  };
}

function makeOkResponse(ids: string[], total: number, messages: object[]) {
  return {
    ok: true,
    json: async () => ({
      methodResponses: [
        ["Email/query", { ids, total }, "q1"],
        ["Email/get", { list: messages }, "g1"],
      ],
    }),
  } as unknown as Response;
}

describe("StalwartJmapClient.getMailboxMessages pagination", () => {
  let fetchMock: jest.MockedFunction<
    (input: string, init?: RequestInit) => Promise<Response>
  >;
  let client: StalwartJmapClient;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<
      (input: string, init?: RequestInit) => Promise<Response>
    >;
    client = new StalwartJmapClient({
      baseUrl: "https://mail.example.com",
      accessToken: "mail-access-token",
      fetcher: fetchMock as never,
    });
  });

  it("defaults to limit=25 and position=0", async () => {
    fetchMock.mockResolvedValue(makeOkResponse(["m1"], 5, [makeMessage("m1")]));

    await client.getMailboxMessages(mockSession, "mailbox1");

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    const queryParams = body.methodCalls[0][1];
    expect(queryParams.limit).toBe(25);
    expect(queryParams.position).toBe(0);
  });

  it("sends custom limit and position options", async () => {
    fetchMock.mockResolvedValue(makeOkResponse([], 50, []));

    await client.getMailboxMessages(mockSession, "mailbox1", {
      limit: 10,
      position: 40,
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    const queryParams = body.methodCalls[0][1];
    expect(queryParams.limit).toBe(10);
    expect(queryParams.position).toBe(40);
  });

  it("returns messages array from JMAP Email/get response", async () => {
    const msg = makeMessage("m1");
    fetchMock.mockResolvedValue(makeOkResponse(["m1"], 1, [msg]));

    const result = await client.getMailboxMessages(mockSession, "mailbox1");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.id).toBe("m1");
  });

  it("returns total count from JMAP Email/query response", async () => {
    fetchMock.mockResolvedValue(
      makeOkResponse(["m1", "m2"], 99, [makeMessage("m1"), makeMessage("m2")]),
    );

    const result = await client.getMailboxMessages(mockSession, "mailbox1");
    expect(result.total).toBe(99);
  });

  it("returns total=0 and empty messages when mailbox is empty", async () => {
    fetchMock.mockResolvedValue(makeOkResponse([], 0, []));

    const result = await client.getMailboxMessages(mockSession, "mailbox1");
    expect(result.messages).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("sorts Email/query before Email/get in the method calls", async () => {
    fetchMock.mockResolvedValue(makeOkResponse([], 0, []));

    await client.getMailboxMessages(mockSession, "mailbox1");

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    expect(body.methodCalls[0][0]).toBe("Email/query");
    expect(body.methodCalls[1][0]).toBe("Email/get");
  });

  it("requests preview-only Email/get properties for mailbox lists", async () => {
    fetchMock.mockResolvedValue(makeOkResponse([], 0, []));

    await client.getMailboxMessages(mockSession, "mailbox1");

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    const getParams = body.methodCalls[1][1];
    expect(getParams.properties).toEqual(
      expect.arrayContaining(["preview", "hasAttachment"]),
    );
    expect(getParams.properties).not.toContain("bodyStructure");
    expect(getParams.fetchTextBodyValues).toBeUndefined();
    expect(getParams.fetchHTMLBodyValues).toBeUndefined();
  });

  it("filters by the provided mailboxId", async () => {
    fetchMock.mockResolvedValue(makeOkResponse([], 0, []));

    await client.getMailboxMessages(mockSession, "specific-mailbox-id");

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    expect(body.methodCalls[0][1].filter.inMailbox).toBe("specific-mailbox-id");
  });
});

describe("StalwartJmapClient.getMessagesByIds", () => {
  let fetchMock: jest.MockedFunction<
    (input: string, init?: RequestInit) => Promise<Response>
  >;
  let client: StalwartJmapClient;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<
      (input: string, init?: RequestInit) => Promise<Response>
    >;
    client = new StalwartJmapClient({
      baseUrl: "https://mail.example.com",
      accessToken: "mail-access-token",
      fetcher: fetchMock as never,
    });
  });

  it("fetches full bodies when includeBodies is true", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        methodResponses: [["Email/get", { list: [makeMessage("m1")] }, "c1"]],
      }),
    } as unknown as Response);

    await client.getMessagesByIds(mockSession, ["m1"], { includeBodies: true });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    const getParams = body.methodCalls[0][1];
    expect(getParams.properties).toContain("bodyStructure");
    expect(getParams.fetchTextBodyValues).toBe(true);
    expect(getParams.fetchHTMLBodyValues).toBe(true);
  });

  it("skips body fetch flags for preview-only reads", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        methodResponses: [["Email/get", { list: [makeMessage("m1")] }, "c1"]],
      }),
    } as unknown as Response);

    await client.getMessagesByIds(mockSession, ["m1"], { includeBodies: false });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1]!.body as string,
    );
    const getParams = body.methodCalls[0][1];
    expect(getParams.properties).toContain("preview");
    expect(getParams.properties).not.toContain("bodyStructure");
    expect(getParams.fetchTextBodyValues).toBeUndefined();
  });
});

describe("mail pagination helpers", () => {
  it("uses total count when the server reports one", () => {
    expect(hasMoreMailboxMessages(25, 120)).toBe(true);
    expect(hasMoreMailboxMessages(120, 120)).toBe(false);
  });

  it("falls back to full-page heuristics when total is unknown", () => {
    expect(hasMoreMailboxMessages(25, 0)).toBe(true);
    expect(hasMoreMailboxMessages(23, 0)).toBe(false);
  });

  it("deduplicates appended mailbox pages", () => {
    const merged = appendMailboxMessages(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    );
    expect(merged.map((message) => message.id)).toEqual(["c"]);
  });

  it("exports the mailbox page size used by the web client", () => {
    expect(MAILBOX_MESSAGES_PAGE_SIZE).toBe(25);
  });
});
