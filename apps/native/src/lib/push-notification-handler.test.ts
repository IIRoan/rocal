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

  it("registers a synchronous foreground presentation handler once", () => {
    const { registerForegroundPushNotificationHandler: register } =
      require("./push-notification-handler") as typeof import("./push-notification-handler");

    register();
    register();

    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mockSetNotificationHandler.mock.calls[0]?.[0];
    expect(handler.handleNotification()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});
