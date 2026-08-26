import { describe, expect, it } from "@jest/globals";
import { formatNotificationChannelsSummary } from "../notification-settings";

describe("formatNotificationChannelsSummary", () => {
  it("defaults both channels on when settings are missing", () => {
    expect(formatNotificationChannelsSummary()).toBe("Email and app");
    expect(formatNotificationChannelsSummary(null)).toBe("Email and app");
  });

  it("names the enabled channels", () => {
    expect(
      formatNotificationChannelsSummary({
        emailNotifications: true,
        pushNotifications: true,
      }),
    ).toBe("Email and app");
    expect(
      formatNotificationChannelsSummary({
        emailNotifications: true,
        pushNotifications: false,
      }),
    ).toBe("Email only");
    expect(
      formatNotificationChannelsSummary({
        emailNotifications: false,
        pushNotifications: true,
      }),
    ).toBe("App only");
    expect(
      formatNotificationChannelsSummary({
        emailNotifications: false,
        pushNotifications: false,
      }),
    ).toBe("Off");
  });
});
