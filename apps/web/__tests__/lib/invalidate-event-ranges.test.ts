import { describe, expect, it, jest } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import { invalidateEventRanges } from "../../hooks/use-calendar-data";

describe("invalidateEventRanges", () => {
  it("invalidates exactly one month key for a single-day event", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    invalidateEventRanges(
      queryClient,
      new Date("2026-03-15"),
      new Date("2026-03-15"),
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["events", "2026-03"],
    });
  });

  it("invalidates both months for a cross-month event", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    invalidateEventRanges(
      queryClient,
      new Date("2026-01-30"),
      new Date("2026-02-02"),
    );

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["events", "2026-01"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["events", "2026-02"],
    });
  });

  it("falls back to broad invalidation when start is missing", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    invalidateEventRanges(queryClient, null);

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["events"] });
  });
});
