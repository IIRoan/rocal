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

import { GoToDateDialog } from "./go-to-date-dialog";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("GoToDateDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  const onGoToDate = jest.fn<(date: Date) => void>();
  const onOpenChange = jest.fn<(open: boolean) => void>();

  const renderDialog = () => {
    act(() =>
      root.render(
        <GoToDateDialog
          currentDate={new Date("2026-03-28T23:30:00.000Z")}
          onGoToDate={onGoToDate}
          onOpenChange={onOpenChange}
          open
          timezone="Europe/Amsterdam"
        />,
      ),
    );
    return document.querySelector<HTMLInputElement>("input[type='date']");
  };

  const submit = (input: HTMLInputElement | null, value: string) => {
    act(() => {
      if (input) input.value = value;
      input?.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  };

  it("starts on the shown day in the account time zone", () => {
    expect(renderDialog()?.value).toBe("2026-03-29");
  });

  it.each([
    ["2026-03-28", "2026-03-28T11:00:00.000Z"],
    ["2026-03-29", "2026-03-29T10:00:00.000Z"],
    ["2026-10-25", "2026-10-25T11:00:00.000Z"],
  ])("goes to noon of the Amsterdam day %s across DST", (dayKey, expected) => {
    onGoToDate.mockClear();
    submit(renderDialog(), dayKey);

    expect(onGoToDate.mock.calls[0]?.[0].toISOString()).toBe(expected);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
