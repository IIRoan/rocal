/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { cancelMailMessageReads } from "@workspace/calendar-client/mail-query-coordination";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { resolveMailServerPolicy } from "@workspace/calendar-core";
import type { MailRuntime } from "./mail-runtime";
import type {
  MailboxMessagesInfiniteData,
  MailboxMessagesPage,
} from "./mail-message-cache";
import type { JmapEmailMessage } from "./types";
import { useMailMessage, useMailMutations } from "./use-mail";

jest.mock("@workspace/native-core/providers/AuthProvider", () => ({}));
jest.mock("@workspace/native-core/providers/E2eeProvider", () => ({}));
jest.mock("./mail-api", () => ({}));
jest.mock("./account-bootstrap", () => ({}));
jest.mock("./outgoing-message-crypto", () => ({}));
jest.mock("../search/local-mail-search", () => ({}));
jest.mock("expo-web-browser", () => ({}));

const mockMarkAsUnread = jest.fn(async () => undefined);
const mockGetMessagesByIds = jest.fn<
  Promise<JmapEmailMessage[]>,
  [MailRuntime["session"], string[]]
>();
const mockGetPage = jest.fn<Promise<MailboxMessagesPage>, [number]>();
const client: Partial<MailRuntime["client"]> = {
  markAsUnread: mockMarkAsUnread,
  getMessagesByIds: mockGetMessagesByIds,
};
const runtime: MailRuntime = {
  config: { defaultDomain: "solace.test" } as MailRuntime["config"],
  session: {} as MailRuntime["session"],
  client: client as MailRuntime["client"],
  accountId: "account",
  mailboxes: [],
  identities: [],
  pickerIdentities: [],
  encryptedAtRest: true,
  mailServerPolicy: resolveMailServerPolicy(),
};

function MarkUnread() {
  const mutations = useMailMutations(runtime, "inbox");
  return (
    <button
      id="unread"
      onClick={() => {
        mutations.markAsUnread.mutateAsync("a").catch(() => undefined);
      }}
    >
      Mark unread
    </button>
  );
}

function LoadingReader() {
  const { data } = useMailMessage(runtime, "a");
  return (
    <>
      <p>{data?.subject ?? "Loading"}</p>
      <MarkUnread />
    </>
  );
}

function PaginatedInbox() {
  const pages = useInfiniteQuery({
    queryKey: QUERY_KEYS.mailMessages("inbox"),
    initialPageParam: 0,
    staleTime: Infinity,
    queryFn: ({ pageParam }) => mockGetPage(pageParam),
    getNextPageParam: (page) => (page.position === 0 ? 1 : undefined),
  });
  return (
    <>
      <button
        id="next"
        onClick={() => {
          pages.fetchNextPage().catch(() => undefined);
        }}
      >
        Next page
      </button>
      <MarkUnread />
    </>
  );
}

function seenList(): MailboxMessagesInfiniteData {
  return {
    pages: [
      {
        messages: [{ id: "a", keywords: { $seen: true } }],
        total: 1,
        position: 0,
      },
    ],
    pageParams: [0],
  };
}

describe("mail keyword mutations against stale reads", () => {
  let queryClient: QueryClient;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockGetMessagesByIds.mockReset().mockResolvedValue([]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    queryClient.setQueryData(QUERY_KEYS.mailMessages("inbox"), seenList());
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
  });

  it("keeps a completed unread mutation when an older list fetch returns seen", async () => {
    let release: (value: MailboxMessagesInfiniteData) => void = () => undefined;
    const staleRead = queryClient
      .fetchQuery({
        queryKey: QUERY_KEYS.mailMessages("inbox"),
        queryFn: () =>
          new Promise<MailboxMessagesInfiniteData>((resolve) => {
            release = resolve;
          }),
      })
      .catch(() => undefined);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MarkUnread />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(mockMarkAsUnread).toHaveBeenCalledTimes(1);
    expect(queryClient.isMutating()).toBe(0);
    const keywords = () =>
      queryClient.getQueryData<MailboxMessagesInfiniteData>(
        QUERY_KEYS.mailMessages("inbox"),
      )?.pages[0]?.messages[0]?.keywords;
    expect(keywords()).toEqual({});
    await act(async () => {
      release(seenList());
      await staleRead;
    });
    expect(keywords()).toEqual({});
  });

  it("resumes an active first detail load interrupted by a keyword mutation", async () => {
    let release: (messages: JmapEmailMessage[]) => void = () => undefined;
    const fresh: JmapEmailMessage = {
      id: "a",
      subject: "Loaded message",
      keywords: {},
      textBody: [{ partId: "text" }],
      bodyValues: { text: { value: "body" } },
    };
    mockGetMessagesByIds
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue([fresh]);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LoadingReader />
        </QueryClientProvider>,
      );
    });
    expect(mockGetMessagesByIds).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Loading");
    await act(async () => {
      container.querySelector("button")?.click();
    });
    await act(async () => {
      release([{ ...fresh, keywords: { $seen: true } }]);
    });
    expect(mockGetMessagesByIds).toHaveBeenCalledTimes(2);
    expect(
      queryClient.getQueryData<JmapEmailMessage>(QUERY_KEYS.mailMessage("a"))
        ?.subject,
    ).toBe("Loaded message");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Loaded message");
    expect(
      queryClient.getQueryData<JmapEmailMessage>(QUERY_KEYS.mailMessage("a"))
        ?.keywords,
    ).toEqual({});
  });

  it("finishes the mutation while its resumed detail read is still pending", async () => {
    let release: (messages: JmapEmailMessage[]) => void = () => undefined;
    mockGetMessagesByIds
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LoadingReader />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(mockGetMessagesByIds).toHaveBeenCalledTimes(2);
    expect(queryClient.isMutating()).toBe(0);
    expect(
      queryClient.getQueryState(QUERY_KEYS.mailMessage("a"))?.fetchStatus,
    ).toBe("fetching");
    await act(async () => {
      release([{ id: "a", subject: "Resumed" }]);
    });
  });

  it("finishes a failed mutation while the recovery list refetch is still pending", async () => {
    let release: (page: MailboxMessagesPage) => void = () => undefined;
    mockMarkAsUnread.mockRejectedValueOnce(new Error("Write refused"));
    mockGetPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PaginatedInbox />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#unread")?.click();
    });
    expect(mockGetPage).toHaveBeenCalledTimes(1);
    expect(queryClient.isMutating()).toBe(0);
    expect(
      queryClient.getQueryState(QUERY_KEYS.mailMessages("inbox"))?.fetchStatus,
    ).toBe("fetching");
    await act(async () => {
      release({ messages: [], position: 0, total: 0 });
    });
  });

  it("resumes the interrupted next page instead of refetching only loaded pages", async () => {
    let release: (page: MailboxMessagesPage) => void = () => undefined;
    const oldPage = new Promise<MailboxMessagesPage>((resolve) => {
      release = resolve;
    });
    const next: MailboxMessagesPage = {
      messages: [{ id: "b", keywords: {} }],
      position: 1,
      total: 2,
    };
    let nextReads = 0;
    mockGetPage.mockReset().mockImplementation(async (position) => {
      if (position === 0)
        return { messages: [{ id: "a", keywords: {} }], position: 0, total: 2 };
      nextReads += 1;
      return nextReads === 1 ? oldPage : next;
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PaginatedInbox />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#next")?.click();
    });
    expect(mockGetPage).toHaveBeenLastCalledWith(1);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("#unread")?.click();
    });
    await act(async () => {
      release(next);
    });
    expect(
      queryClient
        .getQueryData<MailboxMessagesInfiniteData>(
          QUERY_KEYS.mailMessages("inbox"),
        )
        ?.pages.flatMap((page) => page.messages.map((message) => message.id)),
    ).toEqual(["a", "b"]);
    expect(mockGetPage.mock.calls.map(([position]) => position)).toEqual([
      1, 1,
    ]);
  });

  it("does not resume a previous account's read after its query was replaced", async () => {
    const key = QUERY_KEYS.mailMessage("a");
    let release: (message: JmapEmailMessage) => void = () => undefined;
    const oldFetch = jest.fn(
      () =>
        new Promise<JmapEmailMessage>((resolve) => {
          release = resolve;
        }),
    );
    const oldObserver = new QueryObserver<JmapEmailMessage>(queryClient, {
      queryKey: key,
      queryFn: oldFetch,
    });
    const stopOld = oldObserver.subscribe(() => undefined);
    let stopNew: () => void = () => undefined;
    try {
      const resume = await cancelMailMessageReads(queryClient, [
        QUERY_KEYS.mailMessageDetailsAll(),
      ]);
      queryClient.clear();
      const newFetch = jest.fn(async () => ({ id: "a", subject: "New owner" }));
      const newObserver = new QueryObserver<JmapEmailMessage>(queryClient, {
        queryKey: key,
        queryFn: newFetch,
      });
      stopNew = newObserver.subscribe(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(oldObserver.getCurrentQuery().isActive()).toBe(true);
      await resume();
      release({ id: "a", subject: "Previous owner" });
      expect(oldFetch).toHaveBeenCalledTimes(1);
      expect(newFetch).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData<JmapEmailMessage>(key)?.subject).toBe(
        "New owner",
      );
    } finally {
      stopOld();
      stopNew();
    }
  });
});
