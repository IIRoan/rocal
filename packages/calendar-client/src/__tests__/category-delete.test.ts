import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent, UpdateEventRequest } from "@workspace/calendar-core";
import { NoopE2eeProvider, withDecryptedEventContent } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class OpeningProvider extends NoopE2eeProvider {
  async hydrateEncryptedEvent(event: CalendarEvent) {
    if (!String(event.encryptedContent).startsWith("sealed:")) {
      throw new Error("cannot open");
    }
    return withDecryptedEventContent(
      event,
      JSON.parse(String(event.encryptedContent).slice("sealed:".length)),
    );
  }
  async attachEventEncryptionShadow<T>(request: T) {
    return request as never;
  }
}

const row = (id: string, encryptedContent: string, categoryId: string | null = null) => ({
  id,
  title: "",
  encryptedContent,
  encryptionState: "encrypted",
  categoryId,
  calendarId: "cal-1",
  userId: "user-1",
  start: "2026-11-02T09:00:00.000Z",
  end: "2026-11-02T10:00:00.000Z",
});

function setup(pages: ReturnType<typeof row>[][]) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const calls: string[] = [];
  jest.spyOn(client, "get").mockImplementation(async (path: string) => {
    const offset = Number(new URL(path, "https://api.test").searchParams.get("offset"));
    const index = offset / 200;
    return {
      events: pages[index] ?? [],
      total: pages.flat().length,
      nextOffset: index + 1 < pages.length ? (index + 1) * 200 : null,
    } as never;
  });
  const put = jest.spyOn(client, "put").mockImplementation(async (path: string, body: unknown) => {
    calls.push(`put ${path}`);
    return { ...row(path.split("/").pop() ?? "", ""), ...(body as object) } as never;
  });
  jest.spyOn(client, "delete").mockImplementation(async (path: string) => {
    calls.push(`delete ${path}`);
    return { success: true } as never;
  });
  return { calls, put, service: new CalendarApiService(client, new OpeningProvider()) };
}

describe("deleteCategory", () => {
  it("re-seals every event that carries the category before deleting it", async () => {
    const { calls, put, service } = setup([
      [
        row("a", `sealed:${JSON.stringify({ title: "Gym", description: "Legs", categoryId: "cat-1", color: "green" })}`),
        row("b", `sealed:${JSON.stringify({ title: "Lunch", categoryId: "cat-2" })}`),
      ],
      [row("c", `sealed:${JSON.stringify({ title: "Run", categoryId: "cat-1" })}`)],
    ]);

    await service.deleteCategory("cat-1");

    expect(calls).toEqual(["put /api/events/a", "put /api/events/c", "delete /api/categories/cat-1"]);
    expect(put.mock.calls[0]?.[1] as UpdateEventRequest).toEqual({
      title: "Gym",
      description: "Legs",
      location: "",
      color: "green",
      categoryId: "",
    });
  });

  it("leaves an event it cannot open alone, so its title is never overwritten", async () => {
    const { calls, service } = setup([[row("a", "unreadable", "cat-1")]]);

    await service.deleteCategory("cat-1");

    expect(calls).toEqual(["delete /api/categories/cat-1"]);
  });
});
