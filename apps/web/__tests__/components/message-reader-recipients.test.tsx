/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { summarizeMailRecipients } from "@workspace/calendar-core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));
jest.mock("../../components/mail/mail-compose-bridge", () => ({ getMailComposeBridge: jest.fn() }));
jest.mock("../../components/mail/mail-avatar", () => ({ SenderAvatar: () => <span /> }));

import { MessageReaderRecipients } from "../../components/mail/message-reader/message-reader-recipients";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const summary = summarizeMailRecipients(
  {
    to: [{ email: "sam+shopping@solace.onl" }, { email: "noor@kiln.studio", name: "Noor Bakker" }],
    cc: [{ email: "bo@jansen.nl", name: "Bo Jansen" }],
  },
  { email: "sam@solace.onl", name: "Sam Rivera" },
);

function button(text: string) {
  return Array.from(document.body.querySelectorAll("button")).find((node) => node.textContent?.includes(text));
}

it("names you first with the plus-tag you were reached at and counts everyone else", () => {
  act(() => root.render(<MessageReaderRecipients summary={summary} compact={false} />));
  expect(container.querySelector("button")?.textContent).toBe("Recipients: you+shopping & 2 others");
});

it("lists To and Cc, and opens a person's actions in place", () => {
  act(() => root.render(<MessageReaderRecipients summary={summary} compact={false} />));
  act(() => container.querySelector("button")?.click());
  expect(document.body.textContent).toContain("To");
  expect(document.body.textContent).toContain("Cc");
  expect(document.body.textContent).toContain("Sent to your +shopping address");
  expect(button("Sam Rivera · you")?.textContent).toContain("sam+shopping@solace.onl");

  const noor = button("Noor Bakker");
  expect(noor?.getAttribute("aria-expanded")).toBe("false");
  act(() => noor?.click());
  expect(noor?.getAttribute("aria-expanded")).toBe("true");
  expect(button("Copy address")).toBeDefined();
  expect(button("Send email")).toBeDefined();
});

it("shows only the count on narrow layouts and nothing without recipients", () => {
  act(() => root.render(<MessageReaderRecipients summary={summary} compact />));
  expect(container.querySelector("button")?.textContent).toBe("3 recipients");
  act(() => root.render(<MessageReaderRecipients summary={summarizeMailRecipients({}, {})} compact={false} />));
  expect(container.querySelector("button")).toBeNull();
});
