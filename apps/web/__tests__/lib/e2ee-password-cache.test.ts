/** @jest-environment jsdom */

import { afterEach, describe, expect, it } from "@jest/globals";

import {
  clearAuthPasswords,
  clearLegacyRememberedPassword,
  clearPendingAuthPassword,
  peekPendingAuthPassword,
  storePendingAuthPassword,
} from "../../lib/e2ee-password-cache";

describe("e2ee auth password cache", () => {
  afterEach(() => {
    clearAuthPasswords();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps the sign-in password in memory only", () => {
    storePendingAuthPassword("StrongMailboxPassword!42");

    expect(peekPendingAuthPassword()).toBe("StrongMailboxPassword!42");
    expect(document.cookie).toBe("");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("forgets the password once cleared", () => {
    storePendingAuthPassword("StrongMailboxPassword!42");

    clearPendingAuthPassword();

    expect(peekPendingAuthPassword()).toBeNull();
  });

  it("trims passwords before storing them", () => {
    storePendingAuthPassword("  StrongMailboxPassword!42  ");

    expect(peekPendingAuthPassword()).toBe("StrongMailboxPassword!42");
  });

  it("removes the 30-day password cookie and its key that earlier builds stored", () => {
    document.cookie = "solace_enc_pw=ciphertext; path=/";
    localStorage.setItem("solace:enc-device-key", "jwk");
    sessionStorage.setItem("solace:enc-fresh-sign-in", "1");

    clearLegacyRememberedPassword();

    expect(document.cookie).not.toContain("solace_enc_pw");
    expect(localStorage.getItem("solace:enc-device-key")).toBeNull();
    expect(sessionStorage.getItem("solace:enc-fresh-sign-in")).toBeNull();
  });

  it("clears the legacy copy whenever all passwords are cleared", () => {
    document.cookie = "solace_enc_pw=ciphertext; path=/";
    storePendingAuthPassword("StrongMailboxPassword!42");

    clearAuthPasswords();

    expect(peekPendingAuthPassword()).toBeNull();
    expect(document.cookie).not.toContain("solace_enc_pw");
  });
});
