const mockSetNotificationHandler = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...args: unknown[]) =>
    mockSetNotificationHandler(...args),
}));

describe("registerForegroundPushNotificationHandler", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSetNotificationHandler.mockClear();
  });

  it("registers a foreground presentation handler once", async () => {
    const { registerForegroundPushNotificationHandler: register } =
      require("./push-notification-handler") as typeof import("./push-notification-handler");

    register();
    register();

    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mockSetNotificationHandler.mock.calls[0]?.[0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});
