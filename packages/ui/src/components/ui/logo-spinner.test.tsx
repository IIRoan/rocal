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

describe("PageLoadingOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
});
