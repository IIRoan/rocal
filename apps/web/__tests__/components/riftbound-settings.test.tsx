/** @jest-environment jsdom */
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_RIFTBOUND_PREFERENCES as mockDefaults } from "@workspace/calendar-core/riftbound-settings";
import { RiftboundSettings } from "@/components/command-palette/riftbound-settings";

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Calendar: Icon,
    Check: Icon,
    Gamepad2: Icon,
    X: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Loader2: Icon,
    CheckIcon: Icon,
    ChevronDownIcon: Icon,
    ChevronUpIcon: Icon,
  };
});

const mockSetDraft = jest.fn();
const mockAddStore = jest.fn();
const mockSave = jest.fn();
const mockSync = jest.fn();
const mockStore = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fixture shop",
  address: "Venue",
};
let mockLoading = false;
let mockError: string | null = null;
let mockDirty = false;
let mockEnabled = false;

jest.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    settings: { userId: "fixture-user", riftbound: mockDefaults },
    loading: mockLoading,
    error: mockError,
    updateSettings: jest.fn(),
  }),
}));
jest.mock("@/components/calendar-data-provider", () => ({
  useSharedCalendarData: () => ({ calendars: [] }),
}));
jest.mock("@/hooks/use-riftbound", () => ({
  useWebRiftboundForm: () => ({
    draft: { ...mockDefaults, enabled: mockEnabled, stores: [mockStore] },
    setDraft: mockSetDraft,
    eventUrl: "https://playriftbound.com/en-US/events/123",
    setEventUrl: jest.fn(),
    dirty: mockDirty,
    store: { mutate: mockAddStore, isPending: false, isError: false },
    save: {
      mutate: mockSave,
      isPending: false,
      isError: false,
      isSuccess: false,
    },
    sync: { mutate: mockSync, isPending: false, isError: false },
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockError = null;
  mockDirty = false;
  mockEnabled = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render() {
  act(() => root.render(<RiftboundSettings goBack={() => {}} />));
}
function button(label: string) {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error("Missing fixture button");
  return found;
}

it("has an opt-in registered-only choice that discloses roster matching, and resolves a store from a public event link", () => {
  render();
  const toggles =
    container.querySelectorAll<HTMLButtonElement>('[role="switch"]');
  expect(toggles[1]?.getAttribute("aria-checked")).toBe("false");
  expect(container.textContent).toContain("match you to a public roster");
  act(() => toggles[1]?.click());
  expect(mockSetDraft).toHaveBeenCalledWith(
    expect.objectContaining({ registeredOnly: true }),
  );
  act(() => button("Add store").click());
  expect(mockAddStore).toHaveBeenCalledWith(
    "https://playriftbound.com/en-US/events/123",
  );
  expect(container.textContent).toContain("Fixture shop");
});

it("submits the store link from the mobile keyboard", () => {
  render();
  const form = container
    .querySelector("#riftbound-store-link")
    ?.closest("form");
  expect(form).not.toBeNull();
  act(() => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(mockAddStore).toHaveBeenCalledWith(
    "https://playriftbound.com/en-US/events/123",
  );
});

it("requires saved, enabled settings before manual sync", () => {
  render();
  expect(button("Sync now").disabled).toBe(true);
  mockEnabled = true;
  mockDirty = true;
  render();
  expect(button("Sync now").disabled).toBe(true);
  mockDirty = false;
  render();
  act(() => button("Sync now").click());
  expect(mockSync).toHaveBeenCalled();
  act(() => button("Save settings").click());
  expect(mockSave).toHaveBeenCalled();
});

it("offers a remove action and explains exact names and import retention", () => {
  render();
  const remove = container.querySelector<HTMLButtonElement>(
    '[aria-label="Remove Fixture shop"]',
  );
  act(() => remove?.click());
  expect(mockSetDraft).toHaveBeenCalledWith(
    expect.objectContaining({ stores: [] }),
  );
  expect(container.textContent).toContain("including spaces");
  expect(container.textContent).toContain(
    "not automatically edited or deleted",
  );
});

it("keeps the actions outside the scrollable fields on short screens", () => {
  render();
  const body = container.querySelector('[data-slot="palette-body"]');
  const footer = container.querySelector('[data-slot="palette-footer"]');
  expect(body?.contains(container.querySelector("#riftbound-riot-id"))).toBe(
    true,
  );
  expect(body?.contains(button("Save settings"))).toBe(false);
  expect(footer?.contains(button("Save settings"))).toBe(true);
  expect(footer?.contains(button("Sync now"))).toBe(true);
});

it("renders loading and error states without displaying the form", () => {
  mockLoading = true;
  render();
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Loading",
  );
  mockLoading = false;
  mockError = "failed";
  render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "could not be loaded",
  );
  expect(container.querySelector("#riftbound-riot-id")).toBeNull();
});
