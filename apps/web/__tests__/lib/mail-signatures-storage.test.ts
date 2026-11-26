/** @jest-environment jsdom */
import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  MAIL_SIGNATURE_LIMITS,
  MAIL_TEMPLATE_LIMITS,
  putMailSettingsBodySchema,
  type MailSignature,
  type MailTemplate,
  type PutMailSettingsRequest,
} from "@workspace/calendar-core";
import { generateAccountKey } from "@/lib/e2ee-crypto";
import { clearActiveE2eeSession, setActiveE2eeSession } from "@/lib/e2ee-session";
import { readLocalMailSyncedSettings, saveMailSyncedSettings } from "@/lib/e2ee-mail-settings";
import { readMailComposeSettings, writeMailComposeSettings } from "@/lib/mail/compose-settings";
import {
  MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
  MAIL_SIGNATURES_STORAGE_KEY,
  clearLocalMailSettings,
  clearLocalMailSignaturesMemory,
  restoreLocalMailSignatures,
  restoreLocalMailTemplates,
  restoreLocalTrustedSenders,
  writeLocalTrustedSenders,
} from "@/lib/mail/mail-settings-storage";

const mockPutMailSettings = jest.fn(async (_request: PutMailSettingsRequest) => undefined);

jest.mock("@/lib/calendar-api-service", () => ({
  calendarApiService: {
    getMailSettings: async () => null,
    putMailSettings: (request: PutMailSettingsRequest) => mockPutMailSettings(request),
  },
}));

const signature: MailSignature = { id: "s1", name: "Work", body: "Alex Doe\nInvoices team" };
const defaults = [{ identityId: "id-1", newMessage: "s1", replyForward: null }];

beforeEach(async () => {
  clearLocalMailSettings();
  clearActiveE2eeSession();
  mockPutMailSettings.mockClear();
  const accountKey = await generateAccountKey();
  setActiveE2eeSession({
    userId: "user-1",
    deviceId: "device-1",
    accountKey,
    blindIndexKey: accountKey,
    activatedAt: new Date(),
  });
});

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** The largest list `make` builds whose JSON stays within `limit` bytes. */
function fillToBytes<T>(make: (size: number) => T[], limit: number): T[] {
  let low = 0;
  let high = limit;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bytes(make(middle)) <= limit) low = middle;
    else high = middle - 1;
  }
  return make(low);
}

it("keeps signatures out of plaintext storage and reopens them after a reload", async () => {
  writeMailComposeSettings(
    (current) => ({ ...current, signatures: [signature], signatureDefaults: defaults }),
    { sync: false },
  );
  await restoreLocalMailSignatures();
  expect(localStorage.getItem(MAIL_COMPOSE_SETTINGS_STORAGE_KEY)).not.toContain("Invoices");
  const sealed = localStorage.getItem(MAIL_SIGNATURES_STORAGE_KEY);
  expect(sealed).toBeTruthy();
  expect(sealed).not.toContain("Invoices");
  clearLocalMailSignaturesMemory();
  expect(readMailComposeSettings().signatures).toEqual([]);
  await restoreLocalMailSignatures();
  expect(readMailComposeSettings()).toMatchObject({ signatures: [signature], signatureDefaults: defaults });
});

it("clears signatures on sign-out", async () => {
  writeMailComposeSettings(
    (current) => ({ ...current, signatures: [signature], signatureDefaults: defaults }),
    { sync: false },
  );
  await restoreLocalMailSignatures();
  clearLocalMailSettings();
  expect(localStorage.getItem(MAIL_SIGNATURES_STORAGE_KEY)).toBeNull();
  expect(readMailComposeSettings()).toMatchObject({ signatures: [], signatureDefaults: [] });
});

it("seals full templates, full signatures and every other setting under the API's blob limit", async () => {
  const templates = fillToBytes<MailTemplate>(
    (size) =>
      Array.from({ length: 3 }, (_, index) => ({
        id: `${index}`.padStart(32, "t"),
        name: "n".repeat(MAIL_TEMPLATE_LIMITS.name),
        subject: "s".repeat(MAIL_TEMPLATE_LIMITS.subject),
        body: "é".repeat(size),
      })),
    MAIL_TEMPLATE_LIMITS.totalBytes,
  );
  const signatureIds = Array.from({ length: MAIL_SIGNATURE_LIMITS.count }, (_, index) =>
    `${index}`.padStart(32, "s"),
  );
  const signatures = fillToBytes<MailSignature>(
    (size) =>
      signatureIds.map((id) => ({
        id,
        name: "n".repeat(MAIL_SIGNATURE_LIMITS.name),
        body: "é".repeat(size),
      })),
    MAIL_SIGNATURE_LIMITS.totalBytes,
  );
  const signatureDefaults = Array.from({ length: MAIL_SIGNATURE_LIMITS.identities }, (_, index) => ({
    identityId: `${index}`.padStart(64, "i"),
    newMessage: signatureIds[0] ?? null,
    replyForward: signatureIds[1] ?? null,
  }));
  expect(bytes(templates)).toBeGreaterThan(MAIL_TEMPLATE_LIMITS.totalBytes - 50);
  expect(bytes(signatures)).toBeGreaterThan(MAIL_SIGNATURE_LIMITS.totalBytes - 50);
  writeMailComposeSettings(
    (current) => ({ ...current, templates, signatures, signatureDefaults }),
    { sync: false },
  );
  writeLocalTrustedSenders(
    Array.from({ length: 100 }, (_, index) => `sender-${index}@trusted.example`),
  );
  await Promise.all([restoreLocalTrustedSenders(), restoreLocalMailTemplates(), restoreLocalMailSignatures()]);

  await expect(saveMailSyncedSettings(readLocalMailSyncedSettings())).resolves.toBe(true);
  const request = mockPutMailSettings.mock.calls[0]?.[0];
  expect(putMailSettingsBodySchema.safeParse(request).success).toBe(true);
  // About 60,700 characters today, leaving room for more trusted senders and newer clients' keys.
  expect(request?.encryptedContent.length).toBeLessThan(65_536 - 4_000);
});
