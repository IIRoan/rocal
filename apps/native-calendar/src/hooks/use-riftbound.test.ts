import { riftboundQueryAffected } from "@workspace/calendar-core/riftbound-settings";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

it("invalidates the event ranges native's key factory builds for an imported event", () => {
  const event = { start: "2026-10-30T18:00:00.000Z" };
  expect(
    riftboundQueryAffected(
      QUERY_KEYS.events("2026-10-26T00:00:00.000Z", "2026-11-02T00:00:00.000Z"),
      [event],
      240,
    ),
  ).toBe(true);
  expect(
    riftboundQueryAffected(
      QUERY_KEYS.events("2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z"),
      [event],
      240,
    ),
  ).toBe(false);
});
