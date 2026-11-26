/** @jest-environment jsdom */
import { beforeEach, expect, it } from "@jest/globals";
import { generateAccountKey } from "@/lib/e2ee-crypto";
import { clearActiveE2eeSession, setActiveE2eeSession } from "@/lib/e2ee-session";
import {
  readMailComposeSettings,
  writeMailComposeSettings,
} from "@/lib/mail/compose-settings";
import {
  MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
  MAIL_TEMPLATES_STORAGE_KEY,
  clearLocalMailSettings,
  clearLocalMailTemplatesMemory,
  restoreLocalMailTemplates,
} from "@/lib/mail/mail-settings-storage";

const template = { id: "t1", name: "Thanks", body: "Thanks for the invoice." };

beforeEach(async () => {
  clearLocalMailSettings();
  clearActiveE2eeSession();
  const accountKey = await generateAccountKey();
  setActiveE2eeSession({
    userId: "user-1",
    deviceId: "device-1",
    accountKey,
    blindIndexKey: accountKey,
    activatedAt: new Date(),
  });
});

it("keeps templates out of plaintext storage and reopens them after a reload", async () => {
  writeMailComposeSettings((current) => ({ ...current, templates: [template] }), {
    sync: false,
  });
  await restoreLocalMailTemplates();
  expect(localStorage.getItem(MAIL_COMPOSE_SETTINGS_STORAGE_KEY)).not.toContain("invoice");
  const sealed = localStorage.getItem(MAIL_TEMPLATES_STORAGE_KEY);
  expect(sealed).toBeTruthy();
  expect(sealed).not.toContain("invoice");
  clearLocalMailTemplatesMemory();
  expect(readMailComposeSettings().templates).toEqual([]);
  await restoreLocalMailTemplates();
  expect(readMailComposeSettings().templates).toEqual([template]);
});

it("leaves templates alone when another compose preference changes", async () => {
  writeMailComposeSettings((current) => ({ ...current, templates: [template] }), {
    sync: false,
  });
  await restoreLocalMailTemplates();
  writeMailComposeSettings((current) => ({ ...current, plainTextMode: true }), {
    sync: false,
  });
  expect(readMailComposeSettings()).toMatchObject({
    plainTextMode: true,
    templates: [template],
  });
});

it("clears templates on sign-out", async () => {
  writeMailComposeSettings((current) => ({ ...current, templates: [template] }), {
    sync: false,
  });
  await restoreLocalMailTemplates();
  clearLocalMailSettings();
  expect(localStorage.getItem(MAIL_TEMPLATES_STORAGE_KEY)).toBeNull();
  expect(readMailComposeSettings().templates).toEqual([]);
});
