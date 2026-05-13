/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    syncAccount: jest.fn(),
  },
}));

import { useMailRealtime } from "../../hooks/use-mail-realtime";
import { mailDemoApiService } from "../../lib/mail/api-service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type EventHandler = (event?: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  public onerror: EventHandler | null = null;
  private readonly listeners = new Map<string, Set<EventHandler>>();

  constructor(
    public readonly url: string,
    public readonly options?: EventSourceInit,
  ) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventHandler) {
    const existing = this.listeners.get(type) ?? new Set<EventHandler>();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: EventHandler) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {}

  emit(type: string, data?: string) {
    const event =
      type === "mail.changed"
        ? ({ data } as MessageEvent<string>)
        : (new Event(type) as Event);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function HookHarness({
  accountId,
  enabled = true,
  onSync,
}: {
  accountId: string | null;
  enabled?: boolean;
  onSync: (result: unknown) => void | Promise<void>;
}) {
  useMailRealtime({
    accountId,
    enabled,
    onSync: async (result) => {
      onSync(result);
    },
  });

  return null;
}

const mockApi = jest.mocked(mailDemoApiService);

let container: HTMLDivElement;
let root: Root;

describe("useMailRealtime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    MockEventSource.instances = [];
    Object.defineProperty(window, "EventSource", {
      writable: true,
      value: MockEventSource,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockApi.syncAccount.mockResolvedValue({
      accountId: "acct-1",
      initialized: false,
      changedTypes: ["Email"],
      email: {
        oldState: "email-old",
        newState: "email-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
      mailbox: {
        oldState: "mailbox-old",
        newState: "mailbox-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
      thread: {
        oldState: "thread-old",
        newState: "thread-new",
        created: [],
        updated: [],
        destroyed: [],
        records: [],
      },
    } as any);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it("debounces mail.changed events and refetches sync data", async () => {
    const onSync = jest.fn();

    await act(async () => {
      root.render(<HookHarness accountId="acct-1" onSync={onSync} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi.syncAccount).toHaveBeenCalledTimes(1);
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit("mail.changed", JSON.stringify({
        type: "mail.changed",
        accountId: "acct-1",
        changedTypes: ["Email"],
        receivedAt: "2026-05-13T09:00:00.000Z",
      }));
      source.emit("mail.changed", JSON.stringify({
        type: "mail.changed",
        accountId: "acct-1",
        changedTypes: ["Mailbox"],
        receivedAt: "2026-05-13T09:00:01.000Z",
      }));
      jest.advanceTimersByTime(749);
    });

    expect(mockApi.syncAccount).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mockApi.syncAccount).toHaveBeenCalledTimes(2);
    expect(onSync).toHaveBeenCalledTimes(2);
  });

  it("ignores mail.changed events for a different accountId", async () => {
    const onSync = jest.fn();

    await act(async () => {
      root.render(<HookHarness accountId="acct-1" onSync={onSync} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApi.syncAccount).toHaveBeenCalledTimes(1);
    const source = MockEventSource.instances[0];

    await act(async () => {
      source.emit("mail.changed", JSON.stringify({
        type: "mail.changed",
        accountId: "acct-OTHER",
        changedTypes: ["Email"],
        receivedAt: "2026-05-13T09:00:00.000Z",
      }));
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // Should NOT trigger a sync because the accountId does not match
    expect(mockApi.syncAccount).toHaveBeenCalledTimes(1);
  });
});
