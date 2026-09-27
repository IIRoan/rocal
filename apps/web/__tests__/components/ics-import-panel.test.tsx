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

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: { importICS: jest.fn() },
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    AlertCircle: Icon,
    ArrowLeft: Icon,
    Check: Icon,
    ChevronRight: Icon,
    FileText: Icon,
    Loader2: Icon,
    Upload: Icon,
  };
});

jest.mock("@workspace/ui/components/calendar", () => ({
  getColorSwatchValue: () => "currentColor",
}));

import { toast } from "sonner";
import { IcsImportPanel } from "../../components/ics-import-panel";
import { calendarApiService } from "../../lib/calendar-api-service";
import type { Calendar } from "../../lib/types/calendar";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockImportICS = jest.mocked(calendarApiService.importICS);

const calendars = [
  { id: "cal-work", name: "Work", color: "blue", kind: "owned" },
  {
    id: "cal-home",
    name: "Home",
    color: "green",
    kind: "owned",
    isDefault: true,
  },
  { id: "cal-holidays", name: "Holidays", color: "red", kind: "public_holiday" },
] as Calendar[];

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render(panelCalendars: Calendar[] = calendars) {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <IcsImportPanel calendars={panelCalendars} onBack={jest.fn()} />
      </QueryClientProvider>,
    );
  });
}

async function pickFile(name: string, content: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  const file = new File([content], name, { type: "text/calendar" });
  Object.defineProperty(file, "text", { value: async () => content });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** TanStack Query notifies observers on a timer, so flush one macrotask after the click. */
async function clickImport() {
  await act(async () => {
    findButton("Import events")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButton(label: string) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

describe("IcsImportPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("imports the picked file into the default owned calendar", async () => {
    mockImportICS.mockResolvedValue({
      success: true,
      eventsCreated: 2,
      eventsTotal: 3,
      calendarName: "Home",
    });
    render();

    await pickFile("team.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR");

    const radios = Array.from(container.querySelectorAll('[role="radio"]'));
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "Work",
      "HomeDefault",
    ]);
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");

    await clickImport();

    expect(mockImportICS).toHaveBeenCalledWith({
      calendarId: "cal-home",
      icsContent: "BEGIN:VCALENDAR\nEND:VCALENDAR",
      fileName: "team.ics",
    });
    expect(toast.success).toHaveBeenCalledWith("Imported 2 of 3 events into Home");
    expect(findButton("Import events")).toBeUndefined();
  });

  it("imports into the calendar the user picks", async () => {
    mockImportICS.mockResolvedValue({
      success: true,
      eventsCreated: 1,
      eventsTotal: 1,
    });
    render();

    await pickFile("team.ics", "BEGIN:VCALENDAR");
    act(() => {
      findButton("Work")?.click();
    });
    await clickImport();

    expect(mockImportICS).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "cal-work" }),
    );
  });

  it("rejects files that are not .ics", async () => {
    render();

    await pickFile("notes.txt", "hello");

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Choose a .ics calendar file to import",
    );
    expect(findButton("Import events")).toBeUndefined();
  });

  it("shows the server error and keeps the file for a retry", async () => {
    mockImportICS.mockRejectedValue({
      error: "Bad Request",
      message: "Invalid ICS file",
      statusCode: 400,
    });
    render();

    await pickFile("broken.ics", "BEGIN:VCALENDAR");
    await clickImport();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Invalid ICS file",
    );
    expect(toast.error).toHaveBeenCalled();
    expect(findButton("Import events")).toBeDefined();
  });

  it("explains that an owned calendar is needed first", () => {
    render([calendars[2] as Calendar]);

    expect(container.textContent).toContain(
      "Create a calendar before importing events from a file.",
    );
    expect(findButton("Choose file")?.disabled).toBe(true);
  });
});
