import { describe, expect, it } from "@jest/globals";

import {
  getDeliveredToAddresses,
  getSimpleLoginForward,
  getSimpleLoginForwardNotice,
  getSimpleLoginReplyNotice,
  isSimpleLoginReverseAlias,
  type MailSimpleLoginFields,
} from "../mail-simplelogin";
import {
  getSimpleLoginComposeNotice,
  resolveMessageReplyFrom,
  resolveMessageReplyRecipients,
} from "../mail-reply-identity";

const REVERSE_ALIAS = "noreply_at_notify_example_com_abc@simplelogin.co";

function forwardMessage(
  overrides: Partial<MailSimpleLoginFields> & Record<string, unknown> = {},
) {
  return {
    from: [{ name: "Example Shop", email: "noreply@notify.example.com" }],
    replyTo: [
      { name: "Example Shop - noreply at notify.example.com", email: REVERSE_ALIAS },
    ],
    to: [{ email: "shop.abc@alias.example.net" }],
    cc: [] as { email: string }[],
    "header:Delivered-To:asAddresses:all": [[{ email: "me@solace.onl" }]],
    "header:X-Solace-SimpleLogin:asText": "forward",
    "header:X-SimpleLogin-Envelope-To:asAddresses": [
      { email: "Shop.ABC@alias.example.net" },
    ],
    "header:X-SimpleLogin-Unsub-Behaviour:asText": "alias-disable",
    "header:List-Unsubscribe:asURLs": [
      "mailto:unsubscribe@simplelogin.co?subject=un.WzIsIDEzNzQzNjAyXQ.token_-x",
    ],
    ...overrides,
  };
}

describe("getSimpleLoginForward", () => {
  it("ignores messages without the Stalwart marker, even with SimpleLogin headers", () => {
    expect(
      getSimpleLoginForward(
        forwardMessage({ "header:X-Solace-SimpleLogin:asText": null }),
      ),
    ).toBeNull();
    expect(
      getSimpleLoginForward(
        forwardMessage({ "header:X-Solace-SimpleLogin:asText": "yes" }),
      ),
    ).toBeNull();
  });

  it("returns the alias and a mailto disable action", () => {
    expect(getSimpleLoginForward(forwardMessage())).toEqual({
      alias: "shop.abc@alias.example.net",
      action: expect.objectContaining({
        kind: "alias-disable",
        label: "Disable alias",
        pendingLabel: "Disabling alias…",
        doneLabel: "Alias disabled",
        target: {
          type: "mailto",
          to: "unsubscribe@simplelogin.co",
          subject: "un.WzIsIDEzNzQzNjAyXQ.token_-x",
          body: "Please, unsubscribe me",
        },
      }),
    });
  });

  it("maps the unsubscribe behaviour to the action label", () => {
    const block = getSimpleLoginForward(
      forwardMessage({ "header:X-SimpleLogin-Unsub-Behaviour:asText": "contact-block" }),
    );
    expect(block?.action?.label).toBe("Block sender");
    const other = getSimpleLoginForward(
      forwardMessage({ "header:X-SimpleLogin-Unsub-Behaviour:asText": null }),
    );
    expect(other?.action?.label).toBe("Unsubscribe");
  });

  it("keeps a literal plus in mailto fields and falls back to Proton's subject", () => {
    const withPlus = getSimpleLoginForward(
      forwardMessage({
        "header:List-Unsubscribe:asURLs": [
          "mailto:unsubscribe@simplelogin.co?subject=a+b&body=Stop%20please",
        ],
      }),
    );
    expect(withPlus?.action?.target).toEqual({
      type: "mailto",
      to: "unsubscribe@simplelogin.co",
      subject: "a+b",
      body: "Stop please",
    });
    const noSubject = getSimpleLoginForward(
      forwardMessage({
        "header:List-Unsubscribe:asURLs": ["mailto:unsubscribe@simplelogin.co"],
      }),
    );
    expect(noSubject?.action?.target).toMatchObject({ subject: "Unsubscribe" });
  });

  it("only accepts simplelogin.co mailto and app.simplelogin.io https targets", () => {
    const pick = (urls: string[]) =>
      getSimpleLoginForward(forwardMessage({ "header:List-Unsubscribe:asURLs": urls }))
        ?.action?.target ?? null;

    expect(pick(["mailto:unsubscribe@evil.example"])).toBeNull();
    expect(pick(["mailto:unsubscribe@simplelogin.co.evil.example"])).toBeNull();
    expect(pick(["http://app.simplelogin.io/u/1"])).toBeNull();
    expect(pick(["https://app.simplelogin.io.evil.example/u/1"])).toBeNull();
    expect(pick(["https://app.simplelogin.io@evil.example/u/1"])).toBeNull();
    expect(pick(["https://evil.example/?u=https://app.simplelogin.io"])).toBeNull();
    expect(
      pick(["https://evil.example/u", "https://APP.simplelogin.io/dashboard/unsubscribe/1"]),
    ).toEqual({
      type: "https",
      url: "https://APP.simplelogin.io/dashboard/unsubscribe/1",
    });
  });

  it("links undo to the dashboard with the alias id from the signed subject", () => {
    expect(getSimpleLoginForward(forwardMessage())?.action?.undo).toMatchObject({
      label: "Turn back on",
      url: "https://app.simplelogin.io/dashboard/?highlight_alias_id=13743602",
    });
    const https = getSimpleLoginForward(
      forwardMessage({
        "header:List-Unsubscribe:asURLs": ["https://app.simplelogin.io/dashboard/unsubscribe/42"],
      }),
    );
    expect(https?.action?.undo?.url).toBe(
      "https://app.simplelogin.io/dashboard/?highlight_alias_id=42",
    );
  });

  it("falls back to an alias search when the alias id is unreadable", () => {
    const pickUndoUrl = (subject: string) =>
      getSimpleLoginForward(
        forwardMessage({
          "header:List-Unsubscribe:asURLs": [
            `mailto:unsubscribe@simplelogin.co?subject=${subject}`,
          ],
        }),
      )?.action?.undo?.url;
    const search =
      "https://app.simplelogin.io/dashboard/?query=shop.abc%40alias.example.net";
    expect(pickUndoUrl("un.not-json.sig")).toBe(search);
    expect(pickUndoUrl("un.WzMsIDk5XQ.sig")).toBe(search);
    expect(pickUndoUrl("Unsubscribe")).toBe(search);
  });

  it("offers unblock for blocked senders and no undo for plain unsubscribes", () => {
    const block = getSimpleLoginForward(
      forwardMessage({ "header:X-SimpleLogin-Unsub-Behaviour:asText": "contact-block" }),
    );
    expect(block?.action?.undo).toMatchObject({
      label: "Unblock",
      url: "https://app.simplelogin.io/dashboard/?query=shop.abc%40alias.example.net",
    });
    const other = getSimpleLoginForward(
      forwardMessage({ "header:X-SimpleLogin-Unsub-Behaviour:asText": null }),
    );
    expect(other?.action?.undo).toBeNull();
  });

  it("reports no action when List-Unsubscribe is missing", () => {
    expect(
      getSimpleLoginForward(forwardMessage({ "header:List-Unsubscribe:asURLs": null })),
    ).toEqual({ alias: "shop.abc@alias.example.net", action: null });
  });
});

describe("SimpleLogin addressing", () => {
  it("detects reverse aliases by exact domain", () => {
    expect(isSimpleLoginReverseAlias(REVERSE_ALIAS)).toBe(true);
    expect(isSimpleLoginReverseAlias("x@sub.simplelogin.co")).toBe(false);
    expect(isSimpleLoginReverseAlias(null)).toBe(false);
  });

  it("flattens Delivered-To instances topmost first", () => {
    expect(
      getDeliveredToAddresses({
        "header:Delivered-To:asAddresses:all": [
          [{ email: "me@solace.onl" }],
          null,
          [{ email: "old@proton.me" }],
        ],
      }),
    ).toEqual([{ email: "me@solace.onl" }, { email: "old@proton.me" }]);
  });

  it("replies from the delivered mailbox, not the alias in To", () => {
    const identities = [
      { id: "other", email: "other@solace.onl" },
      { id: "me", email: "me@solace.onl" },
    ];
    expect(resolveMessageReplyFrom(identities, forwardMessage())).toEqual({
      identityId: "me",
    });
  });

  it("replies to the reverse alias and never Ccs the alias or own identities", () => {
    const message = forwardMessage({
      cc: [{ email: "friend@example.com" }, { email: "other@solace.onl" }],
    });
    const identities = [{ email: "me@solace.onl" }, { email: "other@solace.onl" }];
    expect(
      resolveMessageReplyRecipients(message, {
        mode: "reply",
        fromEmail: "me@solace.onl",
        identities,
      }),
    ).toEqual({ to: [REVERSE_ALIAS], cc: [] });
    expect(
      resolveMessageReplyRecipients(message, {
        mode: "reply-all",
        fromEmail: "me@solace.onl",
        identities,
      }),
    ).toEqual({ to: [REVERSE_ALIAS], cc: ["friend@example.com"] });
  });
});

describe("getSimpleLoginReplyNotice", () => {
  it("explains what the sender sees when every recipient is a reverse alias", () => {
    expect(
      getSimpleLoginReplyNotice({
        message: forwardMessage(),
        recipients: [REVERSE_ALIAS],
        fromEmail: "me@solace.onl",
        receivingEmail: "me@solace.onl",
      }),
    ).toEqual({
      replyingThrough: { sender: "Example Shop", alias: "shop.abc@alias.example.net" },
      requiredFrom: null,
    });
  });

  it("warns when From is not the mailbox SimpleLogin forwarded to", () => {
    expect(
      getSimpleLoginReplyNotice({
        message: forwardMessage(),
        recipients: [REVERSE_ALIAS, "friend@example.com"],
        fromEmail: "other@solace.onl",
        receivingEmail: "me@solace.onl",
      }),
    ).toEqual({ replyingThrough: null, requiredFrom: "me@solace.onl" });
  });

  it("stays quiet for unmarked messages or without reverse aliases", () => {
    const quiet = { replyingThrough: null, requiredFrom: null };
    expect(
      getSimpleLoginReplyNotice({
        message: forwardMessage({ "header:X-Solace-SimpleLogin:asText": null }),
        recipients: [REVERSE_ALIAS],
        fromEmail: "other@solace.onl",
        receivingEmail: "me@solace.onl",
      }),
    ).toEqual(quiet);
    expect(
      getSimpleLoginReplyNotice({
        message: forwardMessage(),
        recipients: ["friend@example.com"],
        fromEmail: "other@solace.onl",
        receivingEmail: "me@solace.onl",
      }),
    ).toEqual(quiet);
  });
});

describe("getSimpleLoginComposeNotice", () => {
  const identities = [
    { id: "me", email: "me@solace.onl" },
    { id: "other", email: "other@solace.onl" },
  ];

  it("names the alias the sender sees and the identity SimpleLogin requires", () => {
    expect(
      getSimpleLoginComposeNotice({
        message: forwardMessage(),
        identities,
        fromEmail: "other@solace.onl",
        recipients: [REVERSE_ALIAS],
      }),
    ).toEqual({
      via: {
        alias: "shop.abc@alias.example.net",
        detail: "Example Shop sees this alias, not your address.",
      },
      requiredFrom: {
        identityId: "me",
        email: "me@solace.onl",
        detail: "SimpleLogin only accepts replies from me@solace.onl.",
      },
    });
  });

  it("is empty for ordinary replies", () => {
    expect(
      getSimpleLoginComposeNotice({
        message: forwardMessage({ "header:X-Solace-SimpleLogin:asText": null }),
        identities,
        fromEmail: "me@solace.onl",
        recipients: [REVERSE_ALIAS],
      }),
    ).toEqual({ via: null, requiredFrom: null });
  });
});

describe("getSimpleLoginForwardNotice", () => {
  it("names the alias and the sender", () => {
    const message = forwardMessage();
    const forward = getSimpleLoginForward(message);
    expect(forward && getSimpleLoginForwardNotice(forward, message.from)).toEqual({
      label: "Sent to your SimpleLogin alias",
      alias: "shop.abc@alias.example.net",
      detail: "Example Shop only sees the alias. Replies go back through SimpleLogin.",
    });
  });
});
