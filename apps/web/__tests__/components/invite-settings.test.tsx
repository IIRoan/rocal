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

const mockRevokeInvite = jest.fn();

jest.mock("../../hooks/use-invites", () => ({
  useInvites: () => ({
    data: {
      invites: [
        {
          id: "invite-1",
          email: "friend@example.com",
          token: "token-1",
          status: "pending",
          invitedById: "user-1",
          createdAt: "2026-10-01T00:00:00.000Z",
          expiresAt: "2999-01-01T00:00:00.000Z",
        },
      ],
    },
    isLoading: false,
    refetch: () => {},
  }),
  useCreateInvite: () => ({ mutate: () => {}, isPending: false }),
  useRevokeInvite: () => ({ mutate: mockRevokeInvite, isPending: false }),
}));

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

import { InviteSettings } from "../../components/command-palette/invite-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function findButton(text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (element) =>
      element.textContent?.trim() === text ||
      element.getAttribute("aria-label") === text,
  );
}

async function nextFrame() {
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

describe("InviteSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks before revoking an invite, focusing Cancel first", async () => {
    await act(async () => {
      root.render(<InviteSettings goBack={() => {}} />);
    });

    act(() => findButton("Revoke invite")?.click());
    expect(mockRevokeInvite).not.toHaveBeenCalled();
    const group = container.querySelector("fieldset");
    const titleId = group?.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(titleId)?.textContent).toBe(
      "Revoke the invite for “friend@example.com”?",
    );
    await nextFrame();
    expect(document.activeElement).toBe(findButton("Cancel"));

    act(() => findButton("Cancel")?.click());
    expect(mockRevokeInvite).not.toHaveBeenCalled();
    await nextFrame();
    expect(document.activeElement).toBe(findButton("Revoke invite"));

    act(() => findButton("Revoke invite")?.click());
    act(() => findButton("Revoke invite")?.click());
    expect(mockRevokeInvite).toHaveBeenCalledWith("invite-1");
  });
});
