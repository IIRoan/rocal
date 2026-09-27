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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { CATEGORIES_QUERY_KEY, type EventCategory } from "@workspace/calendar-core";

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
  },
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

import { calendarApiService } from "../../lib/calendar-api-service";
import { EVENTS_QUERY_KEY } from "../../hooks/use-calendar-events-loader";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../../hooks/use-categories";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetCategories = jest.mocked(calendarApiService.getCategories);
const mockCreateCategory = jest.mocked(calendarApiService.createCategory);
const mockUpdateCategory = jest.mocked(calendarApiService.updateCategory);
const mockDeleteCategory = jest.mocked(calendarApiService.deleteCategory);

function category(overrides: Partial<EventCategory>): EventCategory {
  return {
    id: "cat-1",
    name: "Work",
    color: "blue",
    isActive: true,
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

let container: HTMLDivElement;
let queryClient: QueryClient;
let root: Root;

type HookResult<T> = { current: T | null };

function renderHook<T>(useHook: () => T): HookResult<T> {
  const result: HookResult<T> = { current: null };
  function Harness() {
    const value = useHook();
    React.useEffect(() => {
      result.current = value;
    });
    return null;
  }
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return result;
}

function cachedCategories(): EventCategory[] | undefined {
  return queryClient.getQueryData<EventCategory[]>(CATEGORIES_QUERY_KEY);
}

describe("useCategories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it("returns active categories sorted by decrypted name", async () => {
    mockGetCategories.mockResolvedValue([
      category({ id: "b", name: "work" }),
      category({ id: "x", name: "Archived", isActive: false }),
      category({ id: "a", name: "Admin" }),
    ]);

    const result = renderHook(() => useCategories());
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(result.current?.data?.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("creates a category optimistically and replaces it with the saved one", async () => {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, [category({})]);
    let resolveCreate: ((saved: EventCategory) => void) | undefined;
    mockCreateCategory.mockImplementation(
      () =>
        new Promise<EventCategory>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const result = renderHook(() => useCreateCategory());
    await act(async () => {
      result.current!.mutate({ name: "Home", color: "emerald" });
      await Promise.resolve();
    });

    expect(cachedCategories()?.map((entry) => entry.name)).toEqual([
      "Work",
      "Home",
    ]);

    await act(async () => {
      resolveCreate?.(category({ id: "cat-2", name: "Home", color: "emerald" }));
      await Promise.resolve();
    });

    expect(cachedCategories()?.map((entry) => entry.id)).toEqual([
      "cat-1",
      "cat-2",
    ]);
  });

  it("rolls back a failed create", async () => {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, [category({})]);
    mockCreateCategory.mockRejectedValue(new Error("boom"));

    const result = renderHook(() => useCreateCategory());
    await act(async () => {
      result.current!.mutate({ name: "Home", color: "emerald" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cachedCategories()?.map((entry) => entry.name)).toEqual(["Work"]);
  });

  it("patches a category optimistically on rename", async () => {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, [category({})]);
    mockUpdateCategory.mockResolvedValue(category({ name: "Job" }));

    const result = renderHook(() => useUpdateCategory());
    await act(async () => {
      result.current!.mutate({ id: "cat-1", request: { name: "Job" } });
      await Promise.resolve();
    });

    expect(cachedCategories()?.[0]?.name).toBe("Job");
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockUpdateCategory).toHaveBeenCalledWith("cat-1", { name: "Job" });
  });

  it("removes a category optimistically and refreshes events on success", async () => {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, [category({})]);
    mockDeleteCategory.mockResolvedValue({ success: true, message: "ok" });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    const result = renderHook(() => useDeleteCategory());
    await act(async () => {
      result.current!.mutate("cat-1");
      await Promise.resolve();
    });

    expect(cachedCategories()).toEqual([]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: EVENTS_QUERY_KEY });
  });

  it("rolls back a failed delete", async () => {
    queryClient.setQueryData(CATEGORIES_QUERY_KEY, [category({})]);
    mockDeleteCategory.mockRejectedValue(new Error("boom"));

    const result = renderHook(() => useDeleteCategory());
    await act(async () => {
      result.current!.mutate("cat-1");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cachedCategories()?.map((entry) => entry.id)).toEqual(["cat-1"]);
  });
});
