import { describe, expect, it } from "@jest/globals";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { resolveNotificationExtensionOptions } from "./notification-extension-store";

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
