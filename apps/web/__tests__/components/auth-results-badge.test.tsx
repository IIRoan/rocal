/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { AUTH_RESULTS_JMAP_PROPERTY } from "@workspace/calendar-core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import { AuthResultsBadge } from "../../components/mail/auth-results-badge";

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
});

describe("AuthResultsBadge", () => {
  it("opens the results on click and closes on Escape back to the trigger", async () => {
    await act(async () => {
      root.render(
        <AuthResultsBadge
          message={{
            [AUTH_RESULTS_JMAP_PROPERTY]: ["mx.solace.onl; spf=pass; dkim=fail"],
          }}
        />,
      );
    });

    const trigger = container.querySelector("button")!;
    expect(trigger.getAttribute("aria-label")).toBe(
      "Authentication results: SPF: pass, DKIM: fail",
    );
    expect(document.body.textContent).not.toContain("DKIM: fail");

    trigger.focus();
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("SPF: pass");
    expect(document.body.textContent).toContain("DKIM: fail");

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain("DKIM: fail");
    expect(document.activeElement).toBe(trigger);
  });
});
