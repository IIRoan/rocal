import { DEFAULT_MAIL_DISPLAY_SETTINGS } from "@workspace/calendar-core";
import {
  clearMailSettings,
  loadMailComposeSettings,
  loadMailDisplaySettings,
  saveMailComposeSettings,
  saveMailDisplaySettings,
} from "./mail-settings-store";

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

describe("mail settings store", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockSecureStore)) delete mockSecureStore[key];
  });

  it("blocks remote content when nothing has been stored", async () => {
    const settings = await loadMailDisplaySettings();
    expect(settings).toEqual(DEFAULT_MAIL_DISPLAY_SETTINGS);
    expect(settings.externalContentPolicy).toBe("ask");
  });

  it("round-trips display and compose settings", async () => {
    const display = {
      ...DEFAULT_MAIL_DISPLAY_SETTINGS,
      externalContentPolicy: "block" as const,
      trustedSenders: ["news@example.com"],
    };
    await saveMailDisplaySettings(display);
    expect(await loadMailDisplaySettings()).toEqual(display);

    const compose = { ...(await loadMailComposeSettings()), plainTextMode: true };
    await saveMailComposeSettings(compose);
    expect(await loadMailComposeSettings()).toEqual(compose);
  });

  it("forgets trusted senders and compose preferences on sign-out", async () => {
    await saveMailDisplaySettings({
      ...DEFAULT_MAIL_DISPLAY_SETTINGS,
      trustedSenders: ["news@example.com"],
    });
    const compose = await loadMailComposeSettings();
    await saveMailComposeSettings({ ...compose, plainTextMode: true });

    await clearMailSettings();

    expect(Object.keys(mockSecureStore)).toEqual([]);
    expect((await loadMailDisplaySettings()).trustedSenders).toEqual([]);
    expect((await loadMailComposeSettings()).plainTextMode).toBe(false);
  });
});
