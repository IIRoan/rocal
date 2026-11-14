/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import {
  VACATION_REPLY_SERVER_NOTICE,
  VACATION_REPLY_UNAVAILABLE,
  type VacationResponse,
  type VacationResponseUpdate,
} from "@workspace/calendar-core";

const mockSave = jest.fn(async (_update: VacationResponseUpdate) => undefined);
const mockVacation = {
  loading: false,
  supported: true,
  response: null as VacationResponse | null,
  loadError: null,
  dataUpdatedAt: 1,
  save: (update: VacationResponseUpdate) => mockSave(update),
  saving: false,
};

jest.mock("@/hooks/use-mail-vacation-response", () => ({
  useMailVacationResponse: () => mockVacation,
}));
jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));
jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

import { VacationReplySettingsPanel } from "../../components/mail/vacation-reply-settings-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(
      <VacationReplySettingsPanel goBack={() => {}} connection={null} userId="u1" timezone="Europe/Amsterdam" />,
    );
  });
}

function button(text: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("VacationReplySettingsPanel", () => {
  beforeEach(() => {
    mockSave.mockClear();
    mockVacation.supported = true;
    mockVacation.response = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the plaintext notice under the message and saves text only", async () => {
    render();
    expect(container.textContent).toContain(VACATION_REPLY_SERVER_NOTICE);
    act(() => container.querySelector<HTMLButtonElement>('button[role="switch"]')?.click());
    const textarea = container.querySelector("textarea");
    if (!textarea) throw new Error("No message field");
    setValue(textarea, "Back on Monday.");
    await act(async () => button("Save").click());
    expect(mockSave).toHaveBeenCalledWith({
      isEnabled: true,
      fromDate: null,
      toDate: null,
      subject: null,
      textBody: "Back on Monday.",
      htmlBody: null,
    });
  });

  it("refuses to turn on an empty reply with an inline message", async () => {
    render();
    act(() => container.querySelector<HTMLButtonElement>('button[role="switch"]')?.click());
    await act(async () => button("Save").click());
    expect(mockSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Write the reply before turning it on.");
    expect(container.querySelector("textarea")?.getAttribute("aria-invalid")).toBe("true");
  });

  it("explains when the mail server has no auto-reply", () => {
    mockVacation.supported = false;
    render();
    expect(container.textContent).toContain(VACATION_REPLY_UNAVAILABLE);
    expect(container.querySelector("textarea")).toBeNull();
  });
});
