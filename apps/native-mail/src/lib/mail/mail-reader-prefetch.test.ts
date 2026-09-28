import { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";
import {
  prefetchReaderData,
  selectReaderPrefetchTargets,
} from "./mail-reader-prefetch";

jest.mock("./mail-api", () => ({}));

function message(
  id: string,
  threadId: string,
  truncated = false,
): JmapEmailMessage {
  return {
    id,
    threadId,
    bodyValues: { "1": { value: "body", isTruncated: truncated } },
  } as JmapEmailMessage;
}

function createRuntime(client: Partial<MailRuntime["client"]>): MailRuntime {
  return {
    client: client as MailRuntime["client"],
    session: {} as MailRuntime["session"],
  } as MailRuntime;
}

describe("selectReaderPrefetchTargets", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it("fetches details only for capped list copies and each thread once", () => {
    const targets = selectReaderPrefetchTargets(queryClient, [
      message("a", "t1", true),
      message("b", "t1"),
      message("c", "t2"),
    ]);

    expect(targets).toEqual({ messageIds: ["a"], threadIds: ["t1", "t2"] });
  });

  it("skips what is cached, loading, or failed", async () => {
    queryClient.setQueryData(QUERY_KEYS.mailMessage("a"), message("a", "t1"));
    queryClient.setQueryData(QUERY_KEYS.mailThread("t1"), []);
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.mailThread("t2"),
      queryFn: () => new Promise<JmapEmailMessage[]>(() => undefined),
    });
    await queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.mailMessage("c"),
      queryFn: () => Promise.reject(new Error("offline")),
      retry: false,
    });

    const targets = selectReaderPrefetchTargets(queryClient, [
      message("a", "t1", true),
      message("b", "t2", true),
      message("c", "t3", true),
    ]);

    expect(targets).toEqual({ messageIds: ["b"], threadIds: ["t3"] });
  });

  it("stops at the limit so a long screen does not fetch everything", () => {
    const targets = selectReaderPrefetchTargets(
      queryClient,
      [message("a", "t1", true), message("b", "t2", true), message("c", "t3", true)],
      2,
    );

    expect(targets).toEqual({ messageIds: ["a", "b"], threadIds: ["t1", "t2"] });
  });
});

describe("prefetchReaderData", () => {
  it("fills the reader caches from one message batch and one thread batch", async () => {
    const queryClient = new QueryClient();
    const full = { ...message("a", "t1"), subject: "full" };
    const getMessagesByIds = jest.fn(async () => [full]);
    const getThreadsMessages = jest.fn(
      async () =>
        new Map([
          ["t1", [full]],
          ["t2", [message("b", "t2")]],
        ]),
    );

    prefetchReaderData(
      queryClient,
      createRuntime({ getMessagesByIds, getThreadsMessages }),
      [message("a", "t1", true), message("b", "t2")],
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getMessagesByIds).toHaveBeenCalledTimes(1);
    expect(getMessagesByIds).toHaveBeenCalledWith({}, ["a"]);
    expect(getThreadsMessages).toHaveBeenCalledTimes(1);
    expect(getThreadsMessages).toHaveBeenCalledWith({}, ["t1", "t2"]);
    expect(queryClient.getQueryData(QUERY_KEYS.mailMessage("a"))).toBe(full);
    expect(
      queryClient
        .getQueryData<JmapEmailMessage[]>(QUERY_KEYS.mailThread("t2"))
        ?.map((entry) => entry.id),
    ).toEqual(["b"]);
  });

  it("does not repeat requests while the first batch is still loading", () => {
    const queryClient = new QueryClient();
    const getMessagesByIds = jest.fn(
      () => new Promise<JmapEmailMessage[]>(() => undefined),
    );
    const getThreadsMessages = jest.fn(
      () => new Promise<Map<string, JmapEmailMessage[]>>(() => undefined),
    );
    const runtime = createRuntime({ getMessagesByIds, getThreadsMessages });
    const rows = [message("a", "t1", true)];

    prefetchReaderData(queryClient, runtime, rows);
    prefetchReaderData(queryClient, runtime, rows);

    expect(getMessagesByIds).toHaveBeenCalledTimes(1);
    expect(getThreadsMessages).toHaveBeenCalledTimes(1);
  });
});
