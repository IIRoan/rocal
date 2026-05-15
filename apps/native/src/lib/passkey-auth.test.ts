import type { Passkey } from "@better-auth/passkey/client";
import {
  deleteStoredPasskey,
  formatStoredPasskeyDescription,
  getDefaultPasskeyName,
  type PasskeyRouteClient,
} from "./passkey-auth";

function createRouteClient(
  responses: Array<{ data: unknown; error: { message?: string } | null }>,
): PasskeyRouteClient & { $fetch: jest.Mock } {
  return {
    $fetch: jest.fn(async () => responses.shift()),
  } as PasskeyRouteClient & { $fetch: jest.Mock };
}

describe("passkey auth helpers", () => {
  it("names passkeys per platform", () => {
    expect(getDefaultPasskeyName("ios")).toBe("This Apple device");
    expect(getDefaultPasskeyName("android")).toBe("This Android device");
    expect(getDefaultPasskeyName("web")).toBe("This device");
  });

  it("formats stored passkey metadata for settings rows", () => {
    expect(
      formatStoredPasskeyDescription({
        deviceType: "multiDevice",
        backedUp: true,
        createdAt: "2026-01-12T00:00:00.000Z",
      }),
    ).toBe("Synced across devices · Backed up · Added Jan 12, 2026");
  });

  it("forwards delete requests to the Better Auth passkey endpoint", async () => {
    const routeClient = createRouteClient([
      { data: { status: true }, error: null },
    ]);

    await expect(deleteStoredPasskey(routeClient, "passkey-1")).resolves.toBe(
      undefined,
    );

    expect(routeClient.$fetch).toHaveBeenCalledWith("/passkey/delete-passkey", {
      method: "POST",
      body: { id: "passkey-1" },
      throw: false,
    });
  });
});
