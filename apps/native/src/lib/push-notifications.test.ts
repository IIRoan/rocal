import {
  clearStoredPushToken,
  invalidateQueriesForPushTap,
  mapPushNotificationToRoute,
  persistPushToken,
  registerNativePushDevice,
  resetPushRegistrationDedupeForTests,
  resolvePushDeviceMeta,
  unregisterNativePushDevice,
} from "./push-notifications";
import { calendarApiService } from "./api";
import { SECURE_STORE_KEYS } from "./constants";
import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  mailMessageRoute,
} from "./navigation-routes";

jest.mock("./api", () => ({
  calendarApiService: {
    registerPushDevice: jest.fn(async () => ({
      success: true,
      deviceId: "dev-1",
    })),
    unregisterPushDevice: jest.fn(async () => ({
      success: true,
      deletedCount: 1,
    })),
  },
}));

const mockSecureStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore[key] = value;
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

describe("push notification routing", () => {
  it("maps event and mail taps to native routes", () => {
    expect(mapPushNotificationToRoute({ t: "event", eid: "evt-1" })).toBe(
      "/event/evt-1",
    );
    expect(mapPushNotificationToRoute({ t: "mail", mid: "em-1" })).toBe(
      mailMessageRoute("em-1"),
    );
    expect(mapPushNotificationToRoute({ t: "mail" })).toBe(MAIL_TAB_ROUTE);
    expect(mapPushNotificationToRoute({ t: "event" })).toBe(CALENDAR_TAB_ROUTE);
    expect(mapPushNotificationToRoute({})).toBeNull();
  });

  it("invalidates event and mail queries narrowly", () => {
    const invalidateQueries = jest.fn();
    invalidateQueriesForPushTap(
      { invalidateQueries } as never,
      { t: "event", eid: "evt-1" },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["event", "evt-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });

    invalidateQueries.mockClear();
    invalidateQueriesForPushTap(
      { invalidateQueries } as never,
      { t: "mail", mid: "em-1" },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["mail", "message", "em-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["mail", "messages"],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["mail"],
    });
  });
});

describe("push device registration", () => {
  const token = "a".repeat(64);
  const meta = {
    platform: "ios" as const,
    bundleId: "onl.solace.mobile.dev" as const,
    environment: "sandbox" as const,
  };

  beforeEach(() => {
    for (const key of Object.keys(mockSecureStore)) {
      delete mockSecureStore[key];
    }
    resetPushRegistrationDedupeForTests();
    jest.clearAllMocks();
  });

  it("resolves iOS sandbox vs production from the app variant", () => {
    expect(
      resolvePushDeviceMeta({
        platform: "ios",
        bundleId: "onl.solace.mobile.dev",
        appVariant: "development",
      }),
    ).toEqual({
      platform: "ios",
      bundleId: "onl.solace.mobile.dev",
      environment: "sandbox",
    });
    expect(
      resolvePushDeviceMeta({
        platform: "ios",
        bundleId: "onl.solace.mobile",
        appVariant: "production",
      }),
    ).toEqual({
      platform: "ios",
      bundleId: "onl.solace.mobile",
      environment: "production",
    });
    expect(
      resolvePushDeviceMeta({
        platform: "android",
        bundleId: "onl.solace.mobile",
        appVariant: "production",
      }),
    ).toBeNull();
  });

  it("registers a token then unregisters it on sign-out", async () => {
    await registerNativePushDevice({ token, meta });

    expect(calendarApiService.registerPushDevice).toHaveBeenCalledWith({
      token,
      ...meta,
    });
    expect(mockSecureStore[SECURE_STORE_KEYS.PUSH_TOKEN]).toBe(token);

    await unregisterNativePushDevice();
    expect(calendarApiService.unregisterPushDevice).toHaveBeenCalledWith(token);
    expect(mockSecureStore[SECURE_STORE_KEYS.PUSH_TOKEN]).toBeUndefined();
  });

  it("skips the network when the same token is already registered", async () => {
    await registerNativePushDevice({ token, meta });
    jest.clearAllMocks();

    await expect(registerNativePushDevice({ token, meta })).resolves.toBe(
      "unchanged",
    );
    expect(calendarApiService.registerPushDevice).not.toHaveBeenCalled();
  });

  it("re-registers when force is set even if the token is already stored", async () => {
    await registerNativePushDevice({ token, meta });
    jest.clearAllMocks();

    await expect(
      registerNativePushDevice({ token, meta, force: true }),
    ).resolves.toBe("registered");
    expect(calendarApiService.registerPushDevice).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent registrations for the same token into one request", async () => {
    let resolveRegister!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      resolveRegister = resolve;
    });
    (calendarApiService.registerPushDevice as jest.Mock).mockImplementationOnce(
      () => gate,
    );

    const first = registerNativePushDevice({ token, meta });
    const second = registerNativePushDevice({ token, meta });

    // Allow the shared in-flight work to pass SecureStore and hit the API.
    await Promise.resolve();
    await Promise.resolve();

    expect(calendarApiService.registerPushDevice).toHaveBeenCalledTimes(1);
    resolveRegister({ success: true, deviceId: "dev-1" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      "registered",
      "registered",
    ]);
  });

  it("does not unregister other devices when this phone has no token", async () => {
    await unregisterNativePushDevice();
    expect(calendarApiService.unregisterPushDevice).not.toHaveBeenCalled();
  });

  it("clears a stored token even when unregister fails", async () => {
    await persistPushToken("b".repeat(64));
    (calendarApiService.unregisterPushDevice as jest.Mock).mockRejectedValueOnce(
      new Error("offline"),
    );

    await unregisterNativePushDevice();
    expect(mockSecureStore[SECURE_STORE_KEYS.PUSH_TOKEN]).toBeUndefined();
  });
});
