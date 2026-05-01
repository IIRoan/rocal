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

import { PageLoadingOverlay } from "./logo-spinner";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/use-cycling-message", () => ({
  useCyclingMessage: () => ({
    message: "Loading",
    isTransitioning: false,
  }),
}));

jest.mock("../../hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => false,
}));

jest.mock("../../lib/gsap", () => {
  const noopTween = { kill: jest.fn() };

  return {
    GSAP_EASES: {
      reveal: "power3.out",
      emphatic: "expo.out",
      exit: "power2.in",
      gentle: "sine.inOut",
      linear: "none",
    },
    getGsapDirectionOffset: () => ({ x: 0, y: 0 }),
    gsap: {
      killTweensOf: jest.fn(),
      set: jest.fn(),
      to: jest.fn(() => noopTween),
      fromTo: jest.fn(() => noopTween),
      registerPlugin: jest.fn(),
    },
    useGSAP: jest.fn(),
  };
});

jest.mock("../layout/logo", () => ({
  __esModule: true,
  default: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="logo" {...props} />
  ),
}));

function getExpectedDateParts(date: Date) {
  return {
    dayName: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(date),
    dayNum: date.getDate().toString().padStart(2, "0"),
    monthName: new Intl.DateTimeFormat(undefined, {
      month: "long",
    }).format(date),
    year: date.getFullYear().toString(),
  };
}

describe("PageLoadingOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    delete document.documentElement.dataset.calendarBootstrapDate;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete document.documentElement.dataset.calendarBootstrapDate;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders immediately visible when loading starts", () => {
    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    const overlay = document.querySelector<HTMLElement>(
      "[data-page-loading-overlay='true']",
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.style.opacity).toBe("1");
    expect(overlay?.style.visibility).toBe("");
  });

  it("fades out before unmounting", () => {
    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    act(() => {
      root.render(
        <PageLoadingOverlay isLoading={false} fadeDurationMs={300} />,
      );
    });

    let overlay = document.querySelector<HTMLElement>(
      "[data-page-loading-overlay='true']",
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.style.opacity).toBe("0");
    expect(overlay?.style.pointerEvents).toBe("none");

    act(() => {
      jest.advanceTimersByTime(299);
    });

    overlay = document.querySelector<HTMLElement>(
      "[data-page-loading-overlay='true']",
    );
    expect(overlay).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(
      document.querySelector("[data-page-loading-overlay='true']"),
    ).toBeNull();
  });

  it("restores opacity if loading resumes before the fade completes", () => {
    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    act(() => {
      root.render(
        <PageLoadingOverlay isLoading={false} fadeDurationMs={300} />,
      );
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    const overlay = document.querySelector<HTMLElement>(
      "[data-page-loading-overlay='true']",
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.style.opacity).toBe("1");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(
      document.querySelector("[data-page-loading-overlay='true']"),
    ).not.toBeNull();
  });

  it("uses the current loading date instead of the selected calendar date", () => {
    const staleCalendarDate = new Date("1999-04-17T12:00:00.000Z");
    const loadingNow = new Date("2026-05-01T12:34:00.000Z");
    const expected = getExpectedDateParts(loadingNow);

    jest.setSystemTime(loadingNow);
    document.documentElement.dataset.calendarBootstrapDate =
      staleCalendarDate.toISOString();

    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    const renderedText = container.textContent ?? "";

    expect(renderedText).toContain(expected.dayName);
    expect(renderedText).toContain(expected.dayNum);
    expect(renderedText).toContain(expected.monthName);
    expect(renderedText).toContain(expected.year);
    expect(renderedText).not.toContain("1999");
  });

  it("refreshes the displayed date while the overlay is visible", () => {
    const initialTime = new Date("2026-05-01T23:59:00.000Z");
    const nextMinute = new Date("2026-05-02T00:00:00.000Z");

    jest.setSystemTime(initialTime);

    act(() => {
      root.render(<PageLoadingOverlay isLoading={true} fadeDurationMs={300} />);
    });

    expect(container.textContent ?? "").toContain(
      getExpectedDateParts(initialTime).dayNum,
    );

    act(() => {
      jest.setSystemTime(nextMinute);
      jest.advanceTimersByTime(60_000);
    });

    expect(container.textContent ?? "").toContain(
      getExpectedDateParts(nextMinute).dayNum,
    );
  });
});
