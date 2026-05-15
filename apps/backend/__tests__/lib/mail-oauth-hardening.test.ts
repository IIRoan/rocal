import { describe, expect, it } from "@jest/globals";

import {
  getMailOauthConfigurationErrors,
  resolveMailOauthEnabled,
} from "../../lib/env";
import { runMailOauthClientSeedTasks } from "../../lib/mail-oauth-bootstrap";

describe("mail OAuth hardening", () => {
  it("lets mail OAuth stay disabled when configuration is absent", () => {
    const missingConfig = {
      clientId: "",
      redirectUris: [],
      browserClientId: "",
      browserRedirectUris: [],
    };

    expect(
      resolveMailOauthEnabled({
        enabled: "false",
        ...missingConfig,
      }),
    ).toBe(false);

    expect(getMailOauthConfigurationErrors(missingConfig)).toEqual([
      "MAIL_OAUTH_CLIENT_ID must be configured for mail OAuth.",
      "MAIL_OAUTH_REDIRECT_URIS must contain at least one absolute URL.",
      "MAIL_OAUTH_BROWSER_CLIENT_ID must be configured for browser mail OAuth.",
      "MAIL_OAUTH_BROWSER_REDIRECT_URIS must contain at least one absolute URL.",
    ]);
  });

  it("auto-enables mail OAuth only when all required config is present", () => {
    expect(
      resolveMailOauthEnabled({
        clientId: "solace-mail",
        redirectUris: ["https://app.solace.test/mail/oauth/callback"],
        browserClientId: "solace-mail-browser",
        browserRedirectUris: ["https://app.solace.test/mail/oauth/callback"],
      }),
    ).toBe(true);

    expect(
      resolveMailOauthEnabled({
        clientId: "solace-mail",
        redirectUris: [],
        browserClientId: "solace-mail-browser",
        browserRedirectUris: ["https://app.solace.test/mail/oauth/callback"],
      }),
    ).toBe(false);
  });

  it("serializes managed mail OAuth client seeding", async () => {
    const order: string[] = [];

    let resolveFirstTask!: (value: string) => void;
    const firstTask = new Promise<string>((resolve) => {
      resolveFirstTask = resolve;
    });

    const runPromise = runMailOauthClientSeedTasks([
      async () => {
        order.push("first:start");
        const result = await firstTask;
        order.push(`first:end:${result}`);
        return result;
      },
      async () => {
        order.push("second:start");
        order.push("second:end");
        return "second";
      },
    ]);

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    resolveFirstTask("first");
    await Promise.resolve();
    await Promise.resolve();

    await expect(runPromise).resolves.toEqual(["first", "second"]);
    expect(order).toEqual([
      "first:start",
      "first:end:first",
      "second:start",
      "second:end",
    ]);
  });
});
