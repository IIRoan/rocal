/** @jest-environment jsdom */

import React, { act, useState } from "react";
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
    getCategoryUsageCounts: jest.fn(),
    deleteCategory: jest.fn(),
  },
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@workspace/ui/components/calendar", () => ({
  getColorSwatchValue: () => "#2563eb",
}));

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import { calendarApiService } from "../../lib/calendar-api-service";
import { CategoryManager } from "../../components/category-manager";
import type { PaletteView } from "../../components/command-palette/constants";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetCategories = jest.mocked(calendarApiService.getCategories);
const mockGetUsage = jest.mocked(calendarApiService.getCategoryUsageCounts);
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
let serverCategories: EventCategory[];

function Palette() {
  const [view, setView] = useState<PaletteView>("categories");
  return (
    <CategoryManager
      currentView={view}
      onBack={() => setView("categories")}
      onNavigateTo={setView}
    />
  );
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

async function click(text: string) {
  await act(async () => {
    findButton(text).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function deletingStatus(): Element | undefined {
  return Array.from(container.querySelectorAll('[role="status"]')).find(
    (element) => element.textContent?.includes("Deleting category…"),
  );
}

describe("CategoryManager deletion pending state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    root = createRoot(container);
    serverCategories = [category({}), category({ id: "cat-2", name: "Home" })];
    mockGetCategories.mockImplementation(async () => serverCategories);
    mockGetUsage.mockResolvedValue({});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
  });

  it.each(["resolve", "reject"] as const)(
    "shows the deletion in the list after the editor closes until the server answers, then clears it on %s",
    async (outcome) => {
      let settle: ((succeeded: boolean) => void) | undefined;
      mockDeleteCategory.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            settle = (succeeded) => {
              if (succeeded) {
                serverCategories = serverCategories.filter((entry) => entry.id !== "cat-1");
                resolve({ success: true, message: "ok" });
              } else {
                reject(new Error("boom"));
              }
            };
          }),
      );
      queryClient.setQueryData(CATEGORIES_QUERY_KEY, serverCategories);
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Palette />
          </QueryClientProvider>,
        );
      });
      await flush();
      expect(deletingStatus()).toBeUndefined();
      expect(findButton("Create New Category").disabled).toBe(false);

      await click("Work");
      await click("Delete category");
      await click("Delete Work");
      await flush();

      expect(container.querySelector("#category-name")).toBeNull();
      expect(container.textContent).not.toContain("Work");
      expect(deletingStatus()).toBeDefined();
      expect(findButton("Create New Category").disabled).toBe(true);

      await act(async () => {
        settle?.(outcome === "resolve");
      });
      await flush();

      expect(deletingStatus()).toBeUndefined();
      expect(findButton("Create New Category").disabled).toBe(false);
      if (outcome === "resolve") {
        expect(container.textContent).not.toContain("Work");
      } else {
        expect(findButton("Work")).toBeDefined();
      }
    },
  );
});
