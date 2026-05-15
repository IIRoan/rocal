/** @jest-environment jsdom */

import { afterEach, describe, expect, it } from "@jest/globals";

import {
  clearAuthPasswords,
  clearPendingAuthPassword,
  peekCachedAuthPassword,
  peekPendingAuthPassword,
  storePendingAuthPassword,
} from "../../lib/e2ee-password-cache";

describe("e2ee auth password cache", () => {
  afterEach(() => {
    clearAuthPasswords();
  });

  it("keeps the cached auth password after clearing only the pending password", () => {
    storePendingAuthPassword("StrongMailboxPassword!42");

    clearPendingAuthPassword();

    expect(peekPendingAuthPassword()).toBeNull();
    expect(peekCachedAuthPassword()).toBe("StrongMailboxPassword!42");
  });

  it("clears both cached and pending passwords when requested", () => {
    storePendingAuthPassword("StrongMailboxPassword!42");

    clearAuthPasswords();

    expect(peekPendingAuthPassword()).toBeNull();
    expect(peekCachedAuthPassword()).toBeNull();
  });
});
