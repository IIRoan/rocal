/** @jest-environment jsdom */
import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarApiService, HttpClient } from "@workspace/calendar-client";
import {
  useRiftboundAutoSync,
  useRiftboundForm,
} from "@workspace/calendar-client/use-riftbound";
import {
  DEFAULT_RIFTBOUND_PREFERENCES,
  riftboundQueryAffected,
} from "@workspace/calendar-core/riftbound-settings";
import { getMonthQueryKey, monthKey } from "@/hooks/use-calendar-events-loader";

const config = {
  ...DEFAULT_RIFTBOUND_PREFERENCES,
  enabled: true,
  registeredOnly: false,
  calendarId: "calendar",
  stores: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Fixture",
      address: "Venue",
    },
  ],
};
const api = new CalendarApiService(
  new HttpClient({ baseURL: "https://api.test", retries: 0 }),
);
const result = { eventsCreated: 0, failedEvents: 0, events: [] };
const hashIdentity = async () => "";
const onImported = jest.fn();
const isActive = () => true;
let resume: () => void = () => {};
const cleanup = jest.fn();
function subscribeToResume(run: () => void) {
  resume = run;
  return cleanup;
}
function Harness({
  scope = "user",
  enabled = true,
}: {
  scope?: string;
  enabled?: boolean;
}) {
  useRiftboundAutoSync({
    api,
    preferences: config,
    scope,
    enabled,
    isActive,
    subscribeToResume,
    hashIdentity,
    onImported,
  });
  return null;
}

const saveSettings = jest.fn(
  (_preferences: unknown, _isCurrent: () => boolean) =>
    new Promise<void>(() => {}),
);
function FormHarness({ scope }: { scope: string }) {
  const form = useRiftboundForm({
    api,
    initial: config,
    scope,
    saveSettings,
    hashIdentity,
    onImported,
  });
  return (
    <button type="button" onClick={() => form.save.mutate()}>
      Save
    </button>
  );
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root, queryClient: QueryClient;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-30T12:00:00Z"));
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function render(scope = "user", enabled = true) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness scope={scope} enabled={enabled} />
      </QueryClientProvider>,
    );
    await jest.advanceTimersByTimeAsync(0);
  });
}

it("checks on opening, every fifteen minutes, and after a throttled resume", async () => {
  const sync = jest.spyOn(api, "syncRiftboundEvents").mockResolvedValue(result);
  await render();
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(30_000);
    resume();
    await jest.advanceTimersByTimeAsync(29_999);
  });
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15 * 60_000);
  });
  expect(sync).toHaveBeenCalledTimes(3);
});

it("cancels the previous account's callback and does not sync while disabled", async () => {
  let finish: (value: typeof result) => void = () => {};
  const sync = jest
    .spyOn(api, "syncRiftboundEvents")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(result);
  await render();
  const isCurrent = sync.mock.calls[0]?.[2];
  expect(isCurrent?.()).toBe(true);
  await render("other-user", false);
  expect(isCurrent?.()).toBe(false);
  expect(cleanup).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(result);
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(onImported).not.toHaveBeenCalled();
  expect(sync).toHaveBeenCalledTimes(1);
});

it("invalidates the month grids web's key factory builds for an imported event", () => {
  const start = "2026-10-30T18:00:00.000Z";
  const month = getMonthQueryKey(monthKey(new Date(start)));
  expect(riftboundQueryAffected(month, [{ start }], 240)).toBe(true);
  expect(
    riftboundQueryAffected(getMonthQueryKey("2027-03"), [{ start }], 240),
  ).toBe(false);
});

it("lets a save finish after the form closes, but cancels it when the account changes", async () => {
  const renderForm = async (scope: string) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FormHarness scope={scope} />
        </QueryClientProvider>,
      );
      await jest.advanceTimersByTimeAsync(0);
    });
  const save = async () =>
    act(async () => {
      container.querySelector("button")?.click();
      await jest.advanceTimersByTimeAsync(0);
    });
  await renderForm("user");
  await save();
  await renderForm("other-user");
  expect(saveSettings.mock.calls[0]?.[1]()).toBe(false);
  await save();
  act(() => root.unmount());
  expect(saveSettings.mock.calls[1]?.[1]()).toBe(true);
  root = createRoot(container);
});
