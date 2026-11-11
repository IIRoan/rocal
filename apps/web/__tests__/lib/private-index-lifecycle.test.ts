/** @jest-environment jsdom */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { clearActiveE2eeSession, setActiveE2eeSession } from "@/lib/e2ee-session";
import { capturePrivateSearchRequest, invalidatePrivateSearch, suspendPrivateSearch } from "@/lib/search/private-index-lifecycle";

function unlock() {
  setActiveE2eeSession({ userId: "u1", deviceId: "d1", accountKey: {} as CryptoKey, blindIndexKey: {} as CryptoKey, activatedAt: new Date() });
}

describe("private search request lifetime", () => {
  beforeEach(() => { clearActiveE2eeSession(); window.localStorage.clear(); window.localStorage.setItem("search:private-content-index-enabled", "true"); unlock(); });
  it("never revives an older collection after disable/re-enable", () => {
    const old = capturePrivateSearchRequest("u1");
    invalidatePrivateSearch();
    window.localStorage.setItem("search:private-content-index-enabled", "false");
    expect(old.isCurrent()).toBe(false);
    window.localStorage.setItem("search:private-content-index-enabled", "true");
    expect(old.isCurrent()).toBe(false);
    expect(capturePrivateSearchRequest("u1").isCurrent()).toBe(true);
  });
  it("blocks collection during sign-out until a new encryption session exists", () => {
    const old = capturePrivateSearchRequest("u1");
    suspendPrivateSearch();
    expect(old.isCurrent()).toBe(false);
    expect(capturePrivateSearchRequest("u1").isCurrent()).toBe(false);
    unlock();
    expect(capturePrivateSearchRequest("u1").isCurrent()).toBe(true);
    expect(old.isCurrent()).toBe(false);
  });
  it("refuses a different account or a cleared encryption session", () => {
    expect(capturePrivateSearchRequest("u2").isCurrent()).toBe(false);
    const old = capturePrivateSearchRequest("u1");
    clearActiveE2eeSession();
    expect(old.isCurrent()).toBe(false);
  });
});
