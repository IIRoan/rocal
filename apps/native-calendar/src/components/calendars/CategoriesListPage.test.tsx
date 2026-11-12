/** @jest-environment jsdom */

import React, { act, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EventCategory } from "@workspace/calendar-core";
import { nativeLightTheme } from "@workspace/design-tokens";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useDeleteCategory } from "../../hooks/use-categories";
import { CategoriesListPage } from "./CategoriesListPage";

const mockTheme = nativeLightTheme;
const mockDelete = jest.fn<Promise<void>, []>();
const mockUnmount = jest.fn();
const mockToast = jest.fn();
let mockServerCategories: EventCategory[];

jest.mock("@workspace/native-core/lib/api", () => ({
  calendarApiService: {
    getCategories: async () => mockServerCategories,
    getCategoryUsageCounts: async () => ({}),
    deleteCategory: () => mockDelete(),
  },
}));
jest.mock("@workspace/native-core/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
jest.mock("@workspace/native-core/providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: mockTheme }),
}));
jest.mock("@workspace/native-core/components/sheet/SheetPageStack", () => ({
  useSheetPageNavigator: () => ({ push: jest.fn() }),
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => {
  const Slot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    SheetScroll: Slot,
    SheetSection: Slot,
    SheetGroup: Slot,
    SheetCenteredState: ({ message }: { message: string }) => (
      <div>{message}</div>
    ),
    SheetItem: ({
      label,
      disabled,
      pending,
      testID,
    }: {
      label: string;
      disabled?: boolean;
      pending?: boolean;
      testID?: string;
    }) => (
      <button data-testid={testID} disabled={disabled || pending}>
        {label}
      </button>
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const category: EventCategory = {
  id: "category-1",
  name: "Travel",
  color: "blue",
  isActive: true,
  userId: "user-1",
  createdAt: new Date("2026-11-12T08:00:00.000Z"),
  updatedAt: new Date("2026-11-12T08:00:00.000Z"),
};

function DeleteAction({ onBack }: { onBack: () => void }) {
  const deletion = useDeleteCategory(category.id);
  useEffect(
    () => () => {
      mockUnmount();
    },
    [],
  );
  return (
    <button
      onClick={() => {
        deletion.mutate();
        onBack();
      }}
    >
      Confirm delete
    </button>
  );
}

function Management() {
  const [editing, setEditing] = useState(true);
  return (
    <>
      <CategoriesListPage />
      {editing ? <DeleteAction onBack={() => setEditing(false)} /> : null}
    </>
  );
}

function deferredDelete() {
  let resolve: () => void = () => {
    throw new Error("Delete promise not initialized");
  };
  let reject: (error: Error) => void = () => {
    throw new Error("Delete promise not initialized");
  };
  const promise = new Promise<void>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

async function flushNotifications() {
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

beforeEach(async () => {
  mockServerCategories = [category];
  mockDelete.mockReset();
  mockUnmount.mockClear();
  mockToast.mockClear();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(QUERY_KEYS.categories(), [category]);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Management />
      </QueryClientProvider>,
    );
  });
  await flushNotifications();
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

it.each(["resolve", "reject"] as const)(
  "keeps deletion pending after the editor unmounts, then clears it on %s",
  async (outcome) => {
    const held = deferredDelete();
    mockDelete.mockImplementation(async () => {
      await held.promise;
      mockServerCategories = [];
    });

    act(() => button("Confirm delete").click());
    await flushNotifications();

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockUnmount).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(QUERY_KEYS.categories())).toEqual([]);
    expect(container.textContent).not.toContain("Travel");
    expect(container.textContent).toContain("Deleting category…");
    expect(button("New category").disabled).toBe(true);
    expect(container.querySelector('[data-testid="category-create"]')).toBe(
      button("New category"),
    );

    await act(async () => {
      if (outcome === "resolve") held.resolve();
      else held.reject(new Error("Delete refused"));
    });
    await flushNotifications();

    expect(container.textContent).not.toContain("Deleting category…");
    expect(button("New category").disabled).toBe(false);
    expect(client.getQueryData(QUERY_KEYS.categories())).toEqual(
      outcome === "resolve" ? [] : [category],
    );
    if (outcome === "reject") expect(container.textContent).toContain("Travel");
  },
);
