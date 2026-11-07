/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { buildMailRuntime } from "./mail-runtime";
import { useMailRuntime } from "./use-mail";

let mockE2eeReady = false;
let mockProvisioned = true;

jest.mock("@workspace/native-core/providers/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
jest.mock("@workspace/native-core/providers/E2eeProvider", () => ({
  useE2ee: () => ({ isReady: mockE2eeReady }),
}));
jest.mock("./mail-api", () => ({}));
jest.mock("./account-bootstrap", () => ({}));
jest.mock("./outgoing-message-crypto", () => ({}));
jest.mock("../search/local-mail-search", () => ({}));
jest.mock("expo-web-browser", () => ({}));
jest.mock("./mail-runtime", () => ({
  buildMailRuntime: jest.fn(async () => ({
    mailboxes: [{ id: "folder-1", name: mockE2eeReady ? "Projects" : "Encrypted folder" }],
  })),
}));

function MailboxNames() {
  const { data } = useMailRuntime(mockProvisioned);
  return <div>{data?.mailboxes.map((mailbox) => mailbox.name).join(", ")}</div>;
}

describe("mail runtime encryption readiness", () => {
  let queryClient: QueryClient;
  let root: Root;
  let container: HTMLDivElement;

  async function renderMailbox() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MailboxNames />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    mockE2eeReady = false;
    mockProvisioned = true;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
  });

  it("opens encrypted folder names when startup finishes instead of caching a locked placeholder", async () => {
    await renderMailbox();
    mockE2eeReady = true;
    await renderMailbox();

    expect(container.textContent).toBe("Projects");
    expect(buildMailRuntime).toHaveBeenCalledTimes(1);
  });

  it("keeps the restored offline folder names readable while keys are loading", async () => {
    queryClient.setQueryData(QUERY_KEYS.mailRuntime(), {
      mailboxes: [{ id: "folder-1", name: "Saved projects" }],
    });
    await renderMailbox();

    expect(container.textContent).toBe("Saved projects");
    expect(buildMailRuntime).not.toHaveBeenCalled();
  });

  it("does not connect an account that is not provisioned after encryption is ready", async () => {
    mockProvisioned = false;
    mockE2eeReady = true;
    await renderMailbox();

    expect(container.textContent).toBe("");
    expect(buildMailRuntime).not.toHaveBeenCalled();
  });
});
