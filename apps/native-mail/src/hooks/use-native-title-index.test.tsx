/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useNativeTitleIndex } from "./use-native-title-index";
import {
  readNativeTitleIndex,
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
  readNativeTitleIndex: jest.fn(),
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
function Harness() {
  useNativeTitleIndex();
  return null;
}

describe("useNativeTitleIndex", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.mocked(readNativeTitleIndex).mockResolvedValue([]);
    jest
      .mocked(rebuildNativeTitleIndex)
      .mockResolvedValue({ documents: [], pendingBodies: 0, loadedBodies: 0 });
    root = createRoot(document.createElement("div"));
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
    });
    await act(async () => mockEnabledListener(true));
    expect(rebuildNativeTitleIndex).toHaveBeenCalledTimes(2);
    jest.mocked(rebuildNativeTitleIndex).mockResolvedValue({
      documents: [],
      pendingBodies: 940,
      loadedBodies: 0,
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
});
