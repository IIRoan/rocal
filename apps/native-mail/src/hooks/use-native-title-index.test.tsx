/** @jest-environment jsdom */
import {
  activateSessionData,
  closeSessionData,
} from "@workspace/native-core/lib/session-data-lifecycle";
import { unknownPrivateSearchCoverage } from "@workspace/calendar-core";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useNativeTitleIndex } from "./use-native-title-index";
import {
  readNativeTitleIndexSnapshot,
  rebuildNativeTitleIndex,
} from "../lib/search/private-title-index";

const mockRuntime = {} as MailRuntime;
let mockEnabledListener: (enabled: boolean) => void;
jest.mock("@workspace/native-core/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1" }, isAuthenticated: true }),
}));
jest.mock("../lib/mail/use-mail", () => ({
  useMailAccount: () => ({ data: { provisioned: true } }),
  useMailRuntime: () => ({ data: mockRuntime }),
}));
jest.mock("../lib/search/private-title-index", () => ({
  readNativeTitleIndexSnapshot: jest.fn(),
  rebuildNativeTitleIndex: jest.fn(),
}));
jest.mock("@workspace/native-core/lib/search/title-index-store", () => ({
  isNativeTitleIndexEnabled: async () => true,
  subscribeNativeTitleIndexEnabled: (listener: (enabled: boolean) => void) => {
    mockEnabledListener = listener;
    return () => {};
  },
}));

let root: Root;
let container: HTMLDivElement;
function Harness() {
  const index = useNativeTitleIndex();
  return (
    <div>{index.documents.map((document) => document.title).join(",")}</div>
  );
}

describe("useNativeTitleIndex", () => {
  beforeEach(() => {
    activateSessionData("u1");
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest
      .mocked(readNativeTitleIndexSnapshot)
      .mockResolvedValue({
        documents: [],
        coverage: unknownPrivateSearchCoverage(),
      });
    jest
      .mocked(rebuildNativeTitleIndex)
      .mockResolvedValue({
        documents: [],
        pendingBodies: 0,
        loadedBodies: 0,
        coverage: unknownPrivateSearchCoverage(),
      });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    jest.useRealTimers();
  });

  it("backfills a replacement backlog after completion and stops when no bodies load", async () => {
    await act(async () => root.render(<Harness />));
    expect(rebuildNativeTitleIndex).toHaveBeenCalledTimes(1);
    await act(async () => mockEnabledListener(false));
    jest.mocked(rebuildNativeTitleIndex).mockResolvedValueOnce({
      documents: [],
      pendingBodies: 940,
      loadedBodies: 60,
      coverage: unknownPrivateSearchCoverage(),
    });
    await act(async () => mockEnabledListener(true));
    expect(rebuildNativeTitleIndex).toHaveBeenCalledTimes(2);
    jest.mocked(rebuildNativeTitleIndex).mockResolvedValue({
      documents: [],
      pendingBodies: 940,
      loadedBodies: 0,
      coverage: unknownPrivateSearchCoverage(),
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(rebuildNativeTitleIndex).toHaveBeenCalledTimes(3);
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(rebuildNativeTitleIndex).toHaveBeenCalledTimes(3);
  });
  it("does not republish a rebuild after the session closes", async () => {
    let finish = () => undefined as void;
    jest.mocked(rebuildNativeTitleIndex).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              documents: [
                {
                  id: "old",
                  source: "mail",
                  title: "Old private mail",
                  encryptionStatus: "metadata-only",
                },
              ],
              pendingBodies: 0,
              loadedBodies: 1,
              coverage: unknownPrivateSearchCoverage(),
            });
        }),
    );
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await closeSessionData();
    });
    await act(async () => finish());
    expect(container.textContent).toBe("");
  });
});
