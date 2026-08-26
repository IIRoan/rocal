import { describe, expect, it } from "@jest/globals";
import {
  formatNotificationChannelsSummary,
  formatPushDeviceLabel,
  formatPushDeviceLastSeen,
} from "../notification-settings";
import {
  SOLACE_IOS_DEV_BUNDLE_ID,
  SOLACE_IOS_PRODUCTION_BUNDLE_ID,
  isSolaceIosBundleId,
} from "../push-device";

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

describe("formatPushDeviceLabel", () => {
  it("labels production and development iPhones", () => {
    expect(
      formatPushDeviceLabel({
        platform: "ios",
        bundleId: SOLACE_IOS_PRODUCTION_BUNDLE_ID,
      }),
    ).toBe("iPhone");
    expect(
      formatPushDeviceLabel({
        platform: "ios",
        bundleId: SOLACE_IOS_DEV_BUNDLE_ID,
      }),
    ).toBe("iPhone · Solace Dev");
  });
});

describe("formatPushDeviceLastSeen", () => {
  it("formats relative last-seen times", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(
      formatPushDeviceLastSeen("2026-08-26T11:00:00.000Z", now),
    ).toMatch(/Last seen/);
    expect(formatPushDeviceLastSeen("not-a-date", now)).toBe(
      "Last seen unknown",
    );
  });
});

describe("isSolaceIosBundleId", () => {
  it("accepts only known Solace iOS bundle ids", () => {
    expect(isSolaceIosBundleId(SOLACE_IOS_PRODUCTION_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId(SOLACE_IOS_DEV_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId("com.example.app")).toBe(false);
    expect(isSolaceIosBundleId(null)).toBe(false);
  });
});
