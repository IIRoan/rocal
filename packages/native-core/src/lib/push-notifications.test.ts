import {
  SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID,
  SOLACE_MAIL_IOS_BUNDLE_ID,
} from "@workspace/calendar-core";
import {
  clearStoredPushToken,
  extractPushTapData,
  normalizePushTapData,
  persistPushToken,
  registerNativePushDevice,
  resetPushRegistrationDedupeForTests,
  resolvePushDeviceMeta,
  unregisterNativePushDevice,
} from "./push-notifications";
import { calendarApiService } from "./api";
import { SECURE_STORE_KEYS } from "./constants";

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
  it("normalizes event and mail tap payloads", () => {
    expect(normalizePushTapData({ t: "event", eid: "evt-1" })).toEqual({
      t: "event",
      eid: "evt-1",
    });
    expect(
      normalizePushTapData({ t: "mail", emailId: "em-legacy" }),
    ).toEqual({
      t: "mail",
      mid: "em-legacy",
    });
    expect(normalizePushTapData({ t: "unknown" })).toBeNull();
  });

  it("extracts tap data from expo-notifications body and trigger payload", () => {
    expect(
      extractPushTapData({
        date: 0,
        request: {
          identifier: "notif-1",
          content: {
            data: { body: { t: "mail", mid: "em-1" } },
          },
          trigger: {
            type: "push",
            payload: {
              aps: { alert: { title: "Sam", body: "Hello" } },
              body: { t: "mail", mid: "em-1" },
            },
          },
        },
      } as never),
    ).toEqual({ t: "mail", mid: "em-1" });

    expect(
      extractPushTapData({
        date: 0,
        request: {
          identifier: "notif-2",
          content: { data: {} },
          trigger: {
            type: "push",
            payload: { t: "event", eid: "evt-legacy" },
          },
        },
      } as never),
    ).toEqual({ t: "event", eid: "evt-legacy" });
  });
});

describe("push device registration", () => {
  const token = "a".repeat(64);
  const meta = {
    platform: "ios" as const,
    bundleId: SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID,
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
        bundleId: SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID,
        appVariant: "development",
      }),
    ).toEqual({
      platform: "ios",
      bundleId: SOLACE_CALENDAR_IOS_DEV_BUNDLE_ID,
      environment: "sandbox",
    });
    expect(
      resolvePushDeviceMeta({
        platform: "ios",
        bundleId: SOLACE_MAIL_IOS_BUNDLE_ID,
        appVariant: "production",
      }),
    ).toEqual({
      platform: "ios",
      bundleId: SOLACE_MAIL_IOS_BUNDLE_ID,
      environment: "production",
    });
    expect(
      resolvePushDeviceMeta({
        platform: "android",
        bundleId: SOLACE_MAIL_IOS_BUNDLE_ID,
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
