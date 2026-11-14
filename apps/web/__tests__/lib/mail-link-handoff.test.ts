/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  MAIL_LINK_REGISTRY_LIMIT,
  clearMailLinkHandoff,
  createMailLinkRewriter,
  registerMailLinks,
  resolveMailLink,
  setPendingMailto,
  startMailLinkResponder,
  takePendingMailto,
} from "@/lib/mail/mail-link-handoff";

type Listener = ((event: { data: unknown }) => void) | null;

/** Same-tab stand-in for BroadcastChannel: a post reaches every other open channel of the name. */
class MockBroadcastChannel {
  static open: MockBroadcastChannel[] = [];
  onmessage: Listener = null;
  constructor(readonly name: string) {
    MockBroadcastChannel.open.push(this);
  }
  postMessage(data: unknown) {
    for (const channel of MockBroadcastChannel.open) {
      if (channel !== this && channel.name === this.name) channel.onmessage?.({ data });
    }
  }
  close() {
    MockBroadcastChannel.open = MockBroadcastChannel.open.filter((channel) => channel !== this);
  }
}

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

describe("mail link handoff", () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    Object.defineProperty(globalThis, "BroadcastChannel", { value: MockBroadcastChannel, configurable: true });
    stop = startMailLinkResponder();
  });

  afterEach(() => {
    stop();
    clearMailLinkHandoff();
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, "BroadcastChannel");
  });

  it("rewrites mailto links to an opaque handoff URL and resolves them from the reader tab", async () => {
    const { links, rewriteLink } = createMailLinkRewriter(TOKEN);
    expect(rewriteLink({ href: "https://example.org/", text: "site" })).toBeNull();
    const url = rewriteLink({ href: "mailto:a@example.org?subject=Hi", text: "Write" });
    expect(url).toBe(`${window.location.origin}/mail/link#${TOKEN}.0`);
    expect(url).not.toContain("example.org");

    registerMailLinks(links);
    await expect(resolveMailLink(`${TOKEN}.0`)).resolves.toEqual({
      href: "mailto:a@example.org?subject=Hi",
      text: "Write",
    });
  });

  it("answers null for unknown or malformed ids and ignores malformed messages", async () => {
    jest.useFakeTimers();
    const intruder = new MockBroadcastChannel("solace:mail-link");
    const unknown = resolveMailLink(`${TOKEN}.7`, 100);
    intruder.postMessage({ type: "resolved", id: `${TOKEN}.7`, href: "x", text: "y", extra: true });
    intruder.postMessage("resolved");
    jest.advanceTimersByTime(100);
    await expect(unknown).resolves.toBeNull();
    await expect(resolveMailLink("../../etc")).resolves.toBeNull();
    intruder.close();
  });

  it("forgets every link and the pending draft when cleared", async () => {
    jest.useFakeTimers();
    registerMailLinks([{ id: `${TOKEN}.0`, href: "mailto:a@example.org", text: "" }]);
    setPendingMailto({ to: ["a@example.org"], cc: [], bcc: [], subject: "", body: "" });
    clearMailLinkHandoff();
    const pending = resolveMailLink(`${TOKEN}.0`, 50);
    jest.advanceTimersByTime(50);
    await expect(pending).resolves.toBeNull();
    expect(takePendingMailto()).toBeNull();
  });

  it("evicts the oldest links beyond the cap", async () => {
    jest.useFakeTimers();
    registerMailLinks(
      Array.from({ length: MAIL_LINK_REGISTRY_LIMIT + 1 }, (_, index) => ({
        id: `${TOKEN}.${index}`,
        href: `mailto:u${index}@example.org`,
        text: "",
      })),
    );
    const evicted = resolveMailLink(`${TOKEN}.0`, 50);
    jest.advanceTimersByTime(50);
    await expect(evicted).resolves.toBeNull();
    await expect(resolveMailLink(`${TOKEN}.${MAIL_LINK_REGISTRY_LIMIT}`)).resolves.toMatchObject({
      href: `mailto:u${MAIL_LINK_REGISTRY_LIMIT}@example.org`,
    });
  });

  it("hands the pending mailto draft out once", () => {
    const draft = { to: ["a@example.org"], cc: [], bcc: [], subject: "Hi", body: "" };
    setPendingMailto(draft);
    expect(takePendingMailto()).toEqual(draft);
    expect(takePendingMailto()).toBeNull();
  });
});
