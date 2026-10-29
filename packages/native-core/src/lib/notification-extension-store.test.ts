import { describe, expect, it } from "@jest/globals";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        notificationExtension: {
          appGroup: "group.onl.solace.calendar",
          keychainService: "onl.solace.notification-extension",
        },
      },
    },
  },
}));

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import * as SecureStore from "expo-secure-store";
import {
  clearNotificationExtensionSecrets,
  resolveNotificationExtensionOptions,
  writeNotificationExtensionReminderFormat,
} from "./notification-extension-store";

const extra = {
  notificationExtension: {
    appGroup: "group.onl.solace.calendar",
    keychainService: "onl.solace.notification-extension",
  },
};

describe("resolveNotificationExtensionOptions", () => {
  it("targets the App Group keychain with a lock-screen-safe accessibility", () => {
    expect(resolveNotificationExtensionOptions({ platform: "ios", extra })).toEqual({
      accessGroup: "group.onl.solace.calendar",
      keychainService: "onl.solace.notification-extension",
      keychainAccessible: 2,
    });
  });

  it("is disabled off iOS or without extension config", () => {
    expect(
      resolveNotificationExtensionOptions({ platform: "android", extra }),
    ).toBeNull();
    expect(
      resolveNotificationExtensionOptions({ platform: "ios", extra: {} }),
    ).toBeNull();
    expect(
      resolveNotificationExtensionOptions({
        platform: "ios",
        extra: { notificationExtension: { appGroup: "group.x" } },
      }),
    ).toBeNull();
  });
});

describe("writeNotificationExtensionReminderFormat", () => {
  it("shares the account's zone and time format under the item the extension reads, and clears it on sign-out", async () => {
    await writeNotificationExtensionReminderFormat({
      timeZone: "America/New_York",
      timeFormat: "12h",
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "reminder_format",
      JSON.stringify({ timeZone: "America/New_York", timeFormat: "12h" }),
      expect.objectContaining({ accessGroup: "group.onl.solace.calendar" }),
    );

    await clearNotificationExtensionSecrets();
    expect(
      jest.mocked(SecureStore.deleteItemAsync).mock.calls.map(([key]) => key),
    ).toContain("reminder_format");
  });
});
