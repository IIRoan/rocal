import { describe, expect, it } from "@jest/globals";
import { updateEventNotificationsBodySchema } from "../../contracts/notification.contract";

const notifications = [
  { notificationType: "email", minutesBefore: 15, isEnabled: true },
];
const ENCRYPTED_TITLE =
  "v1.oKGio6Slpqeoqaqr.RzKqGz6RlCIjsse98Z5olLmi5f7PQ06_sfA4TvGmoA";

describe("updateEventNotificationsBodySchema", () => {
  it("accepts the reminder title ciphertext", () => {
    expect(
      updateEventNotificationsBodySchema.safeParse({
        notifications,
        encryptedDisplayTitle: ENCRYPTED_TITLE,
      }).success,
    ).toBe(true);
    expect(
      updateEventNotificationsBodySchema.safeParse({
        notifications,
        encryptedDisplayTitle: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a plaintext reminder title", () => {
    expect(
      updateEventNotificationsBodySchema.safeParse({
        notifications,
        displayTitle: "Lunch with Sam",
      }).success,
    ).toBe(false);
    expect(
      updateEventNotificationsBodySchema.safeParse({
        notifications,
        encryptedDisplayTitle: "Lunch with Sam",
      }).success,
    ).toBe(false);
  });

  it("rejects oversized ciphertext", () => {
    expect(
      updateEventNotificationsBodySchema.safeParse({
        notifications,
        encryptedDisplayTitle: `v1.oKGio6Slpqeoqaqr.${"A".repeat(1200)}`,
      }).success,
    ).toBe(false);
  });
});
