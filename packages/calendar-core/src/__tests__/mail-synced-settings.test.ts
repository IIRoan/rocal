import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  DEFAULT_MAIL_LIST_SETTINGS,
} from "../index";
import {
  MAIL_SYNCED_SETTINGS_ENCRYPTION_KEY_VERSION,
  assembleMailSyncedSettings,
  createDefaultMailSyncedSettings,
  pullMailSyncedSettings,
  pushMailSyncedSettings,
  sanitizeMailSyncedSettings,
  type MailSettingsApi,
  type MailSettingsCipher,
} from "../mail-synced-settings";

const plainCipher: MailSettingsCipher = {
  encrypt: async (settings) => `sealed:${JSON.stringify(settings)}`,
  decrypt: async (content) => {
    if (!content.startsWith("sealed:")) throw new Error("bad key");
    return JSON.parse(content.slice("sealed:".length));
  },
};

function apiReturning(
  get: MailSettingsApi["getMailSettings"],
): MailSettingsApi & { puts: unknown[] } {
  const puts: unknown[] = [];
  return {
    puts,
    getMailSettings: get,
    putMailSettings: async (request) => {
      puts.push(request);
      return null;
    },
  };
}

const record = (encryptedContent: string) => ({
  encryptedContent,
  encryptionKeyVersion: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("pullMailSyncedSettings", () => {
  it("returns sanitized server settings when they decrypt", async () => {
    const api = apiReturning(async () =>
      record(`sealed:${JSON.stringify({ list: { density: "comfortable" } })}`),
    );
    const pulled = await pullMailSyncedSettings(api, plainCipher);
    expect(pulled.status).toBe("loaded");
    if (pulled.status === "loaded") {
      expect(pulled.settings.list.density).toBe("comfortable");
    }
  });

  it("reports missing when the server has no record", async () => {
    const api = apiReturning(async () => null);
    await expect(pullMailSyncedSettings(api, plainCipher)).resolves.toEqual({
      status: "missing",
    });
  });

  it("reports unavailable instead of defaults when offline or undecryptable", async () => {
    const offline = apiReturning(async () => {
      throw new Error("network");
    });
    const garbled = apiReturning(async () => record("not-json"));
    await expect(pullMailSyncedSettings(offline, plainCipher)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(pullMailSyncedSettings(garbled, plainCipher)).resolves.toEqual({
      status: "unavailable",
    });
    expect(offline.puts).toEqual([]);
    expect(garbled.puts).toEqual([]);
  });
});

describe("pushMailSyncedSettings", () => {
  it("uploads only ciphertext with the key version", async () => {
    const api = apiReturning(async () => null);
    await pushMailSyncedSettings(api, plainCipher, createDefaultMailSyncedSettings());
    expect(api.puts).toEqual([
      {
        encryptedContent: expect.stringMatching(/^sealed:/),
        encryptionKeyVersion: MAIL_SYNCED_SETTINGS_ENCRYPTION_KEY_VERSION,
      },
    ]);
  });
});

describe("mail-synced-settings", () => {
  it("creates independent default copies", () => {
    const a = createDefaultMailSyncedSettings();
    const b = createDefaultMailSyncedSettings();
    a.display.trustedSenders.push("a@example.com");
    a.compose.attachmentReminderKeywords.push("zzz");
    expect(b.display.trustedSenders).toEqual([]);
    expect(b.compose.attachmentReminderKeywords).not.toContain("zzz");
  });

  it("sanitizes partial and invalid payloads field by field", () => {
    expect(
      sanitizeMailSyncedSettings({
        display: {
          externalContentPolicy: "allow",
          trustedSenders: ["News@Example.com", "bad"],
        },
        compose: { plainTextMode: true },
        list: { density: "comfortable", markAsReadDelay: "nope" },
      }),
    ).toEqual({
      display: {
        ...DEFAULT_MAIL_DISPLAY_SETTINGS,
        externalContentPolicy: "allow",
        trustedSenders: ["news@example.com", "bad"],
      },
      compose: {
        ...DEFAULT_MAIL_COMPOSE_SETTINGS,
        plainTextMode: true,
      },
      list: {
        ...DEFAULT_MAIL_LIST_SETTINGS,
        density: "comfortable",
      },
    });
  });

  it("assembles from local cache parts", () => {
    expect(
      assembleMailSyncedSettings({
        display: {
          ...DEFAULT_MAIL_DISPLAY_SETTINGS,
          externalContentPolicy: "block",
        },
      }).display.externalContentPolicy,
    ).toBe("block");
  });
});
