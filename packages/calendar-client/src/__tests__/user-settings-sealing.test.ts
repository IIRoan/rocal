import { describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class SealingProvider extends NoopE2eeProvider {
  constructor(private readonly opens = true) {
    super();
  }
  async hasActiveSession() {
    return true;
  }
  async encryptJson(value: unknown, aad: string) {
    return `sealed(${aad}):${JSON.stringify(value)}`;
  }
  async decryptJson(encrypted: string, aad: string) {
    const prefix = `sealed(${aad}):`;
    return this.opens && encrypted.startsWith(prefix)
      ? (JSON.parse(encrypted.slice(prefix.length)) as unknown)
      : null;
  }
}

const serverDefaults = {
  id: "settings-1",
  userId: "user-1",
  theme: "light",
  defaultView: "week",
  weekStartDay: 1,
  timezone: "Europe/Amsterdam",
  timeFormat: "24h",
  workingHoursStart: 540,
  workingHoursEnd: 1020,
  workingDays: "[1,2,3,4,5]",
  emailNotifications: true,
  pushNotifications: true,
  browserNotifications: true,
  reminderSound: true,
  defaultEventDuration: 60,
  defaultCalendarId: null,
  compactView: false,
  showWeekNumbers: false,
  showDeclinedEvents: false,
  encryptedPreferences: null as string | null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function sealed(preferences: object) {
  return `sealed(user-settings:v1):${JSON.stringify(preferences)}`;
}

function setup(stored: Partial<typeof serverDefaults>, e2ee = new SealingProvider()) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const row = { ...serverDefaults, ...stored };
  const get = jest.spyOn(client, "get").mockResolvedValue(row as never);
  const put = jest.spyOn(client, "put").mockImplementation(
    async (_path: string, body: unknown) =>
      ({ ...row, ...(body as object) }) as never,
  );
  return { get, put, service: new CalendarApiService(client, e2ee) };
}

describe("sealed user settings", () => {
  it("shows the opened preferences over the defaults the server keeps", async () => {
    const { service } = setup({
      encryptedPreferences: sealed({ theme: "dark", weekStartDay: 0, unknown: 1, compactView: "yes" }),
    });

    const settings = await service.getUserSettings();

    expect(settings).toMatchObject({ theme: "dark", weekStartDay: 0, compactView: false });
    expect(settings).not.toHaveProperty("encryptedPreferences");
    expect(settings).not.toHaveProperty("unknown");
  });

  it("sends app preferences only sealed, merged onto the current ones", async () => {
    const stored = sealed({ theme: "dark", showWeekNumbers: true });
    const { put, service } = setup({ encryptedPreferences: stored });

    await service.updateUserSettings({ weekStartDay: 0, timezone: "UTC" });

    const body = put.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toEqual({
      timezone: "UTC",
      encryptedPreferences: expect.any(String),
      expectedEncryptedPreferences: stored,
    });
    const blob = JSON.parse(
      String(body.encryptedPreferences).replace("sealed(user-settings:v1):", ""),
    ) as Record<string, unknown>;
    expect(blob).toMatchObject({ theme: "dark", showWeekNumbers: true, weekStartDay: 0 });
  });

  it("leaves readable-only updates as they were", async () => {
    const { get, put, service } = setup({});

    await service.updateUserSettings({ timeFormat: "12h", defaultCalendarId: null });

    expect(get).not.toHaveBeenCalled();
    expect(put.mock.calls[0]?.[1]).toEqual({ timeFormat: "12h", defaultCalendarId: null });
  });

  it("never overwrites preferences this device cannot open", async () => {
    const { put, service } = setup(
      { encryptedPreferences: sealed({ theme: "dark" }) },
      new SealingProvider(false),
    );

    await expect(service.updateUserSettings({ theme: "system" })).rejects.toMatchObject({
      message: "Your settings could not be unlocked on this device.",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("refuses app preference writes without an unlocked session", async () => {
    const { put, service } = setup({}, new NoopE2eeProvider() as SealingProvider);

    await expect(service.updateUserSettings({ theme: "dark" })).rejects.toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects values the server used to refuse before sending anything", async () => {
    const { get, put, service } = setup({});

    await expect(service.updateUserSettings({ workingDays: "[9]" })).rejects.toMatchObject({
      message: "Working days must be a JSON array of numbers 0-6",
    });
    await expect(
      service.updateUserSettings({ workingHoursStart: 900, workingHoursEnd: 600 }),
    ).rejects.toMatchObject({
      message: "Working hours start must be before working hours end",
    });
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("seals plaintext preferences once and then leaves them", async () => {
    const plaintext = setup({ theme: "dark", compactView: true });
    await expect(plaintext.service.ensureSealedUserSettings()).resolves.toBe(true);
    expect(plaintext.put.mock.calls[0]?.[1]).toEqual({
      encryptedPreferences: expect.stringContaining('"theme":"dark"'),
      expectedEncryptedPreferences: null,
    });

    const done = setup({ encryptedPreferences: sealed({ theme: "dark" }) });
    await expect(done.service.ensureSealedUserSettings()).resolves.toBe(false);
    expect(done.put).not.toHaveBeenCalled();
  });

  it("keeps both of two quick changes, since writes on one device run one at a time", async () => {
    const server = statefulServer({});

    await Promise.all([
      server.service.updateUserSettings({ theme: "dark" }),
      server.service.updateUserSettings({ weekStartDay: 0 }),
    ]);

    expect(server.preferences()).toMatchObject({ theme: "dark", weekStartDay: 0 });
  });

  it("merges onto another device's newer preferences when the server refuses a stale write", async () => {
    const server = statefulServer({ encryptedPreferences: sealed({ theme: "dark" }) });
    server.beforeNextWrite(() => {
      server.row.encryptedPreferences = sealed({ theme: "dark", compactView: true });
    });

    await server.service.updateUserSettings({ weekStartDay: 0 });

    expect(server.preferences()).toMatchObject({ compactView: true, weekStartDay: 0 });
  });
});

/** A fake /api/settings that refuses a sealed write merged onto preferences it no longer holds, as the API does. */
function statefulServer(stored: Partial<typeof serverDefaults>) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const row = { ...serverDefaults, ...stored };
  let interleave: (() => void) | null = null;
  jest.spyOn(client, "get").mockImplementation(async () => ({ ...row }) as never);
  jest.spyOn(client, "put").mockImplementation(async (_path: string, body: unknown) => {
    const { expectedEncryptedPreferences, ...changes } = body as Record<string, unknown>;
    interleave?.();
    interleave = null;
    if (
      expectedEncryptedPreferences !== undefined &&
      expectedEncryptedPreferences !== row.encryptedPreferences
    ) {
      throw { statusCode: 409, message: "Your settings changed on another device. Try again." };
    }
    Object.assign(row, changes);
    return { ...row } as never;
  });
  return {
    row,
    service: new CalendarApiService(client, new SealingProvider()),
    beforeNextWrite: (run: () => void) => {
      interleave = run;
    },
    preferences: () =>
      JSON.parse(
        String(row.encryptedPreferences).replace("sealed(user-settings:v1):", ""),
      ) as Record<string, unknown>,
  };
}
