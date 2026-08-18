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

jest.mock("@workspace/ui/hooks", () => ({
  usePrefersReducedMotion: () => true,
}));

jest.mock("@workspace/ui/lib/gsap", () => ({
  gsap: {
    fromTo: jest.fn(),
    killTweensOf: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("../../components/event-editor/event-editor-body", () => ({
  EventEditorBody: () => <div data-testid="event-editor-body" />,
}));

jest.mock("../../components/event-editor/event-editor-footer", () => ({
  EventEditorFooter: () => <div data-testid="event-editor-footer" />,
}));

jest.mock("../../components/event-editor/event-editor-header", () => ({
  EventEditorDesktopHeader: ({ dialogTitle }: { dialogTitle: string }) => (
    <div data-testid="event-editor-header">{dialogTitle}</div>
  ),
}));

import { EventEditorPopover } from "../../components/event-editor/event-editor-popover";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const localSettings = {
  timezone: "UTC",
} as const;

let container: HTMLDivElement;
let previewElement: HTMLDivElement;
let root: Root;
let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame;
let originalCancelAnimationFrame: typeof globalThis.cancelAnimationFrame;

describe("EventEditorPopover", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    previewElement = document.createElement("div");
    previewElement.dataset.previewEvent = "true";
    previewElement.getBoundingClientRect = () =>
      ({
        bottom: 240,
        height: 120,
        left: 120,
        right: 280,
        top: 120,
        width: 160,
        x: 120,
        y: 120,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(previewElement);

    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame =
      globalThis.requestAnimationFrame ??
      (((callback: FrameRequestCallback) =>
        window.setTimeout(
          () => callback(performance.now()),
          0,
        )) as typeof globalThis.requestAnimationFrame);
    globalThis.cancelAnimationFrame =
      globalThis.cancelAnimationFrame ??
      (((handle: number) =>
        window.clearTimeout(handle)) as typeof globalThis.cancelAnimationFrame);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });

    previewElement.remove();
    container.remove();

    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("renders the popover content through a portal when open", async () => {
    const onOpenChange = jest.fn();
    const eventForm = {
      isRecurring: false,
      setIsRecurring: jest.fn(),
      setShowNotifications: jest.fn(),
      showNotifications: false,
    } as any;

    await act(async () => {
      root.render(
        <EventEditorPopover
          anchorPosition={{ x: 120, y: 120 }}
          badgeItem={null as any}
          calendars={[] as any}
          dialogTitle="Popover Editor"
          eventForm={eventForm}
          flags={{ canEdit: true, isViewMode: false }}
          handleEventDelete={() => {}}
          handleEventDownloadIcs={() => {}}
          handleEventSave={() => {}}
          invitationResponsePending={null}
          invitationStatus={null}
          leadingSlot={null}
          localSettings={localSettings as any}
          onInvitationResponse={() => {}}
          onOpenChange={onOpenChange}
          open={true}
          recurringModal={null}
          setShowDescription={() => {}}
          setShowLocation={() => {}}
          setShowParticipants={() => {}}
          visibleSections={{
            description: false,
            location: false,
            participants: false,
          }}
        />,
      );

      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Popover Editor");
    expect(
      document.querySelector('[data-testid="event-editor-body"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="event-editor-footer"]'),
    ).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
