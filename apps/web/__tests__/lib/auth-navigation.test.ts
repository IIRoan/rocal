import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  buildPasskeyStepUpLoginHref,
  isPasskeyStepUpExemptPath,
} from "@/lib/auth-navigation";

describe("passkey step-up login navigation", () => {
  it("keeps login, passkey bridge, and reset-password routes on the auth screens", () => {
    expect(isPasskeyStepUpExemptPath("/login")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/passkey/native")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/reset-password")).toBe(true);
    expect(isPasskeyStepUpExemptPath("/calendar")).toBe(false);
    expect(isPasskeyStepUpExemptPath(null)).toBe(false);
    expect(isPasskeyStepUpExemptPath(undefined)).toBe(false);
  });

  it("sends protected routes to login with a step-up hint", () => {
    expect(buildPasskeyStepUpLoginHref("/calendar?eventId=evt-1")).toBe(
      "/login?next=%2Fcalendar%3FeventId%3Devt-1&stepUp=1",
    );
  });
});

describe("auth navigation ownership", () => {
  let navigation: typeof import("../../lib/auth-navigation");
  let previousWindow: PropertyDescriptor | undefined;
  let events: EventTarget;
  const replace = jest.fn<(href: string) => void>();

  beforeEach(() => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    events = new EventTarget();
    replace.mockReset();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { replace },
        addEventListener: events.addEventListener.bind(events),
      },
    });
    jest.isolateModules(() => {
      navigation = jest.requireActual("../../lib/auth-navigation");
    });
  });

  afterEach(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  it("loads a document only once when redirects compete", () => {
    navigation.completeAuthNavigation("/home");
    navigation.completeAuthNavigation("/home");
    navigation.completeAuthNavigation("/calendar");
    expect(replace.mock.calls).toEqual([["/home"]]);
  });

  it("holds logout navigation until cleanup completes", () => {
    const finish = navigation.beginAuthNavigation("/");
    navigation.completeAuthNavigation("/login");
    expect(replace).not.toHaveBeenCalled();
    finish?.();
    finish?.();
    expect(replace.mock.calls).toEqual([["/"]]);
  });

  it("allows another attempt if browser navigation throws", () => {
    replace.mockImplementationOnce(() => {
      throw new Error("navigation failed");
    });
    expect(() => navigation.completeAuthNavigation("/home")).toThrow(
      "navigation failed",
    );
    navigation.completeAuthNavigation("/home");
    expect(replace).toHaveBeenCalledTimes(2);
  });

  it("accepts a new auth flow after a page is restored from the browser cache", () => {
    navigation.completeAuthNavigation("/home");
    const restore = new Event("pageshow");
    Object.defineProperty(restore, "persisted", { value: true });
    events.dispatchEvent(restore);
    navigation.completeAuthNavigation("/login");
    expect(replace.mock.calls).toEqual([["/home"], ["/login"]]);
  });
});
