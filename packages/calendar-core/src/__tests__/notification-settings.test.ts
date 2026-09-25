import { describe, expect, it } from "@jest/globals";
import {
  formatNotificationChannelsSummary,
  formatPushDeviceLabel,
  formatPushDeviceLastSeen,
  getPushDevicesListStatus,
} from "../notification-settings";
import {
  SOLACE_CALENDAR_IOS_BUNDLE_ID,
  SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID,
  SOLACE_MAIL_IOS_BUNDLE_ID,
  SOLACE_MAIL_IOS_DEV_BUNDLE_ID,
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

describe("getPushDevicesListStatus", () => {
  it("keeps paused exclusive of loading, error, empty, and ready", () => {
    expect(
      getPushDevicesListStatus({
        appEnabled: false,
        loading: true,
        error: true,
        deviceCount: 2,
      }),
    ).toBe("paused");
  });

  it("returns loading, error, empty, then ready when app notifications are on", () => {
    expect(
      getPushDevicesListStatus({
        appEnabled: true,
        loading: true,
        error: false,
        deviceCount: 0,
      }),
    ).toBe("loading");
    expect(
      getPushDevicesListStatus({
        appEnabled: true,
        loading: false,
        error: true,
        deviceCount: 0,
      }),
    ).toBe("error");
    expect(
      getPushDevicesListStatus({
        appEnabled: true,
        loading: false,
        error: false,
        deviceCount: 0,
      }),
    ).toBe("empty");
    expect(
      getPushDevicesListStatus({
        appEnabled: true,
        loading: false,
        error: false,
        deviceCount: 1,
      }),
    ).toBe("ready");
  });
});

describe("formatPushDeviceLabel", () => {
  it("labels iPhones by app and variant", () => {
    const label = (bundleId: string) =>
      formatPushDeviceLabel({ platform: "ios", bundleId });
    expect(label(SOLACE_CALENDAR_IOS_BUNDLE_ID)).toBe("iPhone · Calendar");
    expect(label(SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID)).toBe(
      "iPhone · Calendar Dev",
    );
    expect(label(SOLACE_MAIL_IOS_BUNDLE_ID)).toBe("iPhone · Mail");
    expect(label(SOLACE_MAIL_IOS_DEV_BUNDLE_ID)).toBe("iPhone · Mail Dev");
    expect(label("com.example.app")).toBe("iPhone");
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

  it("falls back when Intl.RelativeTimeFormat is missing (Hermes)", () => {
    const original = Intl.RelativeTimeFormat;
    Object.defineProperty(Intl, "RelativeTimeFormat", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const now = new Date("2026-08-26T12:00:00.000Z");
      expect(formatPushDeviceLastSeen("2026-08-26T11:00:00.000Z", now)).toBe(
        "Last seen 1 hour ago",
      );
      expect(formatPushDeviceLastSeen("2026-08-21T12:00:00.000Z", now)).toBe(
        "Last seen 5 days ago",
      );
      expect(formatPushDeviceLastSeen("2026-08-26T12:00:00.000Z", now)).toBe(
        "Last seen just now",
      );
    } finally {
      Object.defineProperty(Intl, "RelativeTimeFormat", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe("isSolaceIosBundleId", () => {
  it("accepts only known Solace iOS bundle ids", () => {
    expect(isSolaceIosBundleId(SOLACE_CALENDAR_IOS_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId(SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId(SOLACE_MAIL_IOS_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId(SOLACE_MAIL_IOS_DEV_BUNDLE_ID)).toBe(true);
    expect(isSolaceIosBundleId("com.example.app")).toBe(false);
    expect(isSolaceIosBundleId(null)).toBe(false);
  });
});
