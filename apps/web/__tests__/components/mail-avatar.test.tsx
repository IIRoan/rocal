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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@workspace/ui/components/ui/blobatar-avatar", () => ({
  BlobatarAvatar: ({
    email,
    name,
    src,
  }: {
    email?: string;
    name?: string;
    src?: string | null;
  }) => (
    <div
      data-testid="blobatar-avatar"
      data-email={email}
      data-name={name}
      data-src={src ?? ""}
    />
  ),
}));

jest.mock("@/hooks/use-solace-profile-image", () => ({
  useSolaceProfileImage: (email?: string | null) =>
    email === "alice@acme.com"
      ? "https://cloudflared.roan.dev/api/profiles/avatar?email=alice%40acme.com"
      : null,
}));

import { SenderAvatar } from "../../components/mail/mail-avatar";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  jest.clearAllMocks();
});

function render(props: { email: string; name?: string }) {
  act(() => {
    root.render(<SenderAvatar {...props} />);
  });
}

describe("SenderAvatar", () => {
  it("seeds the blobatar from the email address", () => {
    render({ email: "alice@acme.com", name: "Alice Example" });

    const avatar = container.querySelector("[data-testid='blobatar-avatar']");
    expect(avatar?.getAttribute("data-email")).toBe("alice@acme.com");
    expect(avatar?.getAttribute("data-name")).toBe("Alice Example");
  });

  it("shows a looked-up Solace profile picture when one exists", () => {
    render({ email: "alice@acme.com", name: "Alice Example" });

    const avatar = container.querySelector("[data-testid='blobatar-avatar']");
    expect(avatar?.getAttribute("data-src")).toBe(
      "https://cloudflared.roan.dev/api/profiles/avatar?email=alice%40acme.com",
    );
  });

  it("still seeds from email when no display name is provided", () => {
    render({ email: "billing@acme.com" });

    const avatar = container.querySelector("[data-testid='blobatar-avatar']");
    expect(avatar?.getAttribute("data-email")).toBe("billing@acme.com");
  });
});
