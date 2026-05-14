import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockRedirect = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

import DashboardPage from "../../app/dashboard/page";

describe("DashboardPage", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
  });

  it("redirects the legacy dashboard route to /calendar and preserves search params", async () => {
    await DashboardPage({
      searchParams: Promise.resolve({
        date: "2026-05-07",
        view: "week",
        eventId: ["evt-1", "evt-2"],
      }),
    });

    expect(mockRedirect).toHaveBeenCalledWith(
      "/calendar?date=2026-05-07&view=week&eventId=evt-1&eventId=evt-2",
    );
  });
});