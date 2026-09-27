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
import type { EventCategory } from "@workspace/calendar-core";

jest.mock("../../hooks/use-categories", () => ({
  useCategories: jest.fn(),
  useCreateCategory: jest.fn(),
  useUpdateCategory: jest.fn(),
  useDeleteCategory: jest.fn(),
}));

jest.mock("@workspace/ui/components/calendar", () => ({
  getColorSwatchValue: () => "#2563eb",
}));

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../../hooks/use-categories";
import { CategoryManager } from "../../components/category-manager";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseCategories = jest.mocked(useCategories);
const mockUseCreateCategory = jest.mocked(useCreateCategory);
const mockUseUpdateCategory = jest.mocked(useUpdateCategory);
const mockUseDeleteCategory = jest.mocked(useDeleteCategory);

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

function mutationMock(overrides: Record<string, unknown> = {}) {
  return { mutate: jest.fn(), isPending: false, ...overrides } as any;
}

let container: HTMLDivElement;
let root: Root;

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("CategoryManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseCreateCategory.mockReturnValue(mutationMock());
    mockUseUpdateCategory.mockReturnValue(mutationMock());
    mockUseDeleteCategory.mockReturnValue(mutationMock());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a loading state while categories load", async () => {
    mockUseCategories.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={() => {}}
          onNavigateTo={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("Loading categories…");
  });

  it("shows the error with a retry action", async () => {
    const refetch = jest.fn();
    mockUseCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={() => {}}
          onNavigateTo={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("boom");
    await click(findButton("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows an empty state without categories", async () => {
    mockUseCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={() => {}}
          onNavigateTo={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("No categories yet");
  });

  it("lists categories with usage and navigates to edit", async () => {
    const onNavigateTo = jest.fn();
    mockUseCategories.mockReturnValue({
      data: [category({ usageCount: 3 })],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={() => {}}
          onNavigateTo={onNavigateTo}
        />,
      );
    });

    expect(container.textContent).toContain("Work");
    expect(container.textContent).toContain("3 events");

    await click(findButton("Work"));
    expect(onNavigateTo).toHaveBeenCalledWith("category-edit");
  });

  it("blocks creating a duplicate name", async () => {
    const create = mutationMock();
    mockUseCreateCategory.mockReturnValue(create);
    mockUseCategories.mockReturnValue({
      data: [category({})],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="category-create"
          onBack={() => {}}
          onNavigateTo={() => {}}
        />,
      );
    });

    const input = container.querySelector(
      "#category-name",
    ) as HTMLInputElement;
    await type(input, " work ");
    await click(findButton("Create"));

    expect(create.mutate).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "A category with this name already exists",
    );
  });

  it("creates a category and goes back on success", async () => {
    const onBack = jest.fn();
    const create = mutationMock({
      mutate: jest.fn((_request: unknown, options: { onSuccess: () => void }) =>
        options.onSuccess(),
      ),
    });
    mockUseCreateCategory.mockReturnValue(create);
    mockUseCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="category-create"
          onBack={onBack}
          onNavigateTo={() => {}}
        />,
      );
    });

    const input = container.querySelector(
      "#category-name",
    ) as HTMLInputElement;
    await type(input, "Home");
    await click(findButton("Create"));

    expect(create.mutate).toHaveBeenCalledWith(
      { name: "Home", color: "blue" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it("requires confirmation before deleting and leaves the edit view", async () => {
    const onBack = jest.fn();
    const onNavigateTo = jest.fn();
    const deleteMutation = mutationMock();
    mockUseDeleteCategory.mockReturnValue(deleteMutation);
    mockUseCategories.mockReturnValue({
      data: [category({ usageCount: 2 })],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={onBack}
          onNavigateTo={onNavigateTo}
        />,
      );
    });
    await click(findButton("Work"));
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="category-edit"
          onBack={onBack}
          onNavigateTo={onNavigateTo}
        />,
      );
    });

    expect(deleteMutation.mutate).not.toHaveBeenCalled();
    await click(findButton("Delete category"));
    expect(container.textContent).toContain(
      "2 events will keep their details but lose this category.",
    );

    await click(findButton("Delete Work"));
    expect(deleteMutation.mutate).toHaveBeenCalledWith("cat-1");
    expect(onBack).toHaveBeenCalled();
  });

  it("saves only changed fields on edit", async () => {
    const onBack = jest.fn();
    const update = mutationMock({
      mutate: jest.fn((_input: unknown, options: { onSuccess: () => void }) =>
        options.onSuccess(),
      ),
    });
    mockUseUpdateCategory.mockReturnValue(update);
    mockUseCategories.mockReturnValue({
      data: [category({})],
      isLoading: false,
      isError: false,
    } as any);
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="categories"
          onBack={onBack}
          onNavigateTo={() => {}}
        />,
      );
    });
    await click(findButton("Work"));
    await act(async () => {
      root.render(
        <CategoryManager
          currentView="category-edit"
          onBack={onBack}
          onNavigateTo={() => {}}
        />,
      );
    });

    const input = container.querySelector(
      "#category-name",
    ) as HTMLInputElement;
    expect(input.value).toBe("Work");

    await type(input, "Job");
    await click(findButton("Save changes"));

    expect(update.mutate).toHaveBeenCalledWith(
      { id: "cat-1", request: { name: "Job" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onBack).toHaveBeenCalled();
  });
});
