/** @jest-environment jsdom */
import { unknownPrivateSearchCoverage } from "@workspace/calendar-core";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { useSession } from "@/lib/auth-client";
import { authSessionDataFixture } from "../mocks/auth-session";
import {
  clearActiveE2eeSession,
  setActiveE2eeSession,
} from "@/lib/e2ee-session";
import {
  loadPrivateTitleIndex,
  rebuildPrivateTitleIndex,
} from "@/lib/search/private-title-index";
import { usePrivateTitleIndex } from "@/hooks/use-private-title-index";

jest.mock("@/lib/search/private-title-index", () => ({
  loadPrivateTitleIndex: jest.fn(),
  rebuildPrivateTitleIndex: jest.fn(),
}));
jest.mock("@/hooks/use-private-search-index-controls", () => ({
  PRIVATE_SEARCH_INDEX_CHANGE_EVENT: "solace-private-search-index-changed",
}));

const snapshot = {
  documents: [],
  indexedAt: null,
  itemCount: 0,
  pendingBodies: 0,
  loadedBodies: 0,
  coverage: unknownPrivateSearchCoverage(),
};
let root: Root;
let container: HTMLDivElement;

export function Harness() {
  const index = usePrivateTitleIndex();
  return (
    <div>{index.documents.map((document) => document.title).join(",")}</div>
  );
}

function unlock() {
  setActiveE2eeSession({
    userId: "u1",
    deviceId: "d1",
    accountKey: {} as CryptoKey,
    blindIndexKey: {} as CryptoKey,
    activatedAt: new Date(),
  });
}

function setEnabled(enabled: boolean) {
  window.localStorage.setItem(
    "search:private-content-index-enabled",
    String(enabled),
  );
  window.dispatchEvent(new Event("solace-private-search-index-changed"));
}

describe("usePrivateTitleIndex", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    clearActiveE2eeSession();
    window.localStorage.clear();
    setEnabled(true);
    jest.mocked(useSession).mockReturnValue({
      data: { ...authSessionDataFixture, user: { ...authSessionDataFixture.user, id: "u1" } },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });
    jest.mocked(loadPrivateTitleIndex).mockResolvedValue(snapshot);
    jest.mocked(rebuildPrivateTitleIndex).mockResolvedValue(snapshot);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    clearActiveE2eeSession();
    jest.useRealTimers();
  });

  it("waits for the account key and starts indexing as soon as it is unlocked", async () => {
    await act(async () => root.render(<Harness />));
    expect(rebuildPrivateTitleIndex).not.toHaveBeenCalled();
    await act(async () => unlock());
    expect(rebuildPrivateTitleIndex).toHaveBeenCalledTimes(1);
  });

  it("backfills a replacement backlog after completion and stops when no bodies load", async () => {
    unlock();
    await act(async () => root.render(<Harness />));
    expect(rebuildPrivateTitleIndex).toHaveBeenCalledTimes(1);
    await act(async () => setEnabled(false));
    jest.mocked(rebuildPrivateTitleIndex).mockResolvedValueOnce({
      ...snapshot,
      pendingBodies: 940,
      loadedBodies: 60,
    });
    await act(async () => setEnabled(true));
    expect(rebuildPrivateTitleIndex).toHaveBeenCalledTimes(2);
    jest
      .mocked(rebuildPrivateTitleIndex)
      .mockResolvedValue({ ...snapshot, pendingBodies: 940, loadedBodies: 0 });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(rebuildPrivateTitleIndex).toHaveBeenCalledTimes(3);
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(rebuildPrivateTitleIndex).toHaveBeenCalledTimes(3);
  });
  it("does not republish an older build after disabling and re-enabling", async () => {
    let finish = () => undefined as void;
    jest.mocked(rebuildPrivateTitleIndex).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              ...snapshot,
              documents: [
                {
                  id: "old",
                  source: "mail",
                  title: "Old private mail",
                  encryptionStatus: "metadata-only",
                },
              ],
            });
        }),
    );
    unlock();
    await act(async () => root.render(<Harness />));
    await act(async () => setEnabled(false));
    await act(async () => setEnabled(true));
    await act(async () => finish());
    expect(container.textContent).toBe("");
  });
});
