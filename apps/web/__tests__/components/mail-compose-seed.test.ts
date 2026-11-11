/** @jest-environment jsdom */

import { expect, it } from "@jest/globals";
import { buildDraftSeed, buildForwardSeed, buildReplySeed } from "@/components/mail/mail-compose-seed";
import type { JmapEmailMessage, JmapIdentity } from "@/lib/mail/types";
import { MAX_MAIL_DISPLAY_CHARACTERS } from "@workspace/calendar-core/mail-mime-limits";

const HOSTILE = '<div data-quoted-html><img src="x" onerror="window.alert(1)"></div>';
const DATE_OPTIONS = { timeFormat: "24h" as const, timezone: "Europe/Amsterdam" };

const identities: JmapIdentity[] = [
  { id: "primary", email: "me@solace.test", name: "Me" },
  { id: "alias", email: "alias@solace.test", name: "Alias" },
];

const conversation: JmapEmailMessage = {
  id: "conversation",
  subject: "Plans",
  from: [{ email: "sender@solace.test" }],
  replyTo: [{ email: "reply@solace.test" }],
  to: [{ email: "me@solace.test" }, { email: "other@solace.test" }],
  cc: [{ email: "alias@solace.test" }, { email: "copy@solace.test" }, { email: "other@solace.test" }],
  receivedAt: "2026-11-10T10:00:00Z",
};

it("reopens a draft with a megabyte inline image without shortening the stored HTML", () => {
  const html = '<p>Screenshot</p><img src="data:image/png;base64,' + "A".repeat(1_400_000) + '">';
  const seed = buildDraftSeed(conversation, identities, "primary", { plaintext: "Screenshot", html });
  expect(seed.patch.composeHtmlBody).toBe(html);
  expect(seed.patch.composeBody).toBe("Screenshot");
});

it("bounds replies and forwards and keeps a visible shortening marker in the quote", () => {
  const text = "x".repeat(MAX_MAIL_DISPLAY_CHARACTERS) + "UNQUOTED_TAIL";
  for (const seed of [buildReplySeed(conversation, text, identities, "primary", DATE_OPTIONS), buildForwardSeed(conversation, text, identities, "primary", DATE_OPTIONS)]) {
    expect(seed.patch.composeBody).toContain("[Earlier message shortened.]");
    expect(seed.patch.composeBody).not.toContain("UNQUOTED_TAIL");
  }
});

it("reply all preserves other recipients and Cc while excluding all self identities", () => {
  const seed = buildReplySeed(conversation, "Hello", identities, "primary", DATE_OPTIONS, "reply-all");

  expect(seed.patch.composeTo).toBe("reply@solace.test");
  expect(seed.patch.composeCc).toBe("other@solace.test, copy@solace.test");
  expect(seed.patch.composeBcc).toBe("");
  expect(seed.patch.composeMode).toBe("reply");
});

it("reply all preserves original To and Cc when replying to a self-sent message", () => {
  const seed = buildReplySeed({ ...conversation, from: [{ email: "alias@solace.test" }], replyTo: [] }, "Hello", identities, "primary", DATE_OPTIONS, "reply-all");
  expect(seed.patch.composeTo).toBe("other@solace.test");
  expect(seed.patch.composeCc).toBe("copy@solace.test");
});

it("reply all excludes a verified SimpleLogin alias and uses its reverse alias", () => {
  const message: JmapEmailMessage = {
    ...conversation,
    to: [{ email: "shop@alias.example.net" }, { email: "me@solace.test" }],
    cc: [{ email: "copy@solace.test" }],
    replyTo: [{ email: "sender_at_shop_example_abc@simplelogin.co" }],
    "header:Delivered-To:asAddresses:all": [[{ email: "me@solace.test" }]],
    "header:X-Solace-SimpleLogin:asText": "forward",
    "header:X-SimpleLogin-Envelope-To:asAddresses": [{ email: "shop@alias.example.net" }],
  };
  const seed = buildReplySeed(message, "Hello", identities, "primary", DATE_OPTIONS, "reply-all");
  expect(seed.patch.composeTo).toBe("sender_at_shop_example_abc@simplelogin.co");
  expect(seed.patch.composeCc).toBe("copy@solace.test");
});

it("ordinary reply keeps only Reply-To and preserves the same quote", () => {
  const reply = buildReplySeed(conversation, "Hello", identities, "primary", DATE_OPTIONS);
  const replyAll = buildReplySeed(conversation, "Hello", identities, "primary", DATE_OPTIONS, "reply-all");

  expect(reply.patch.composeTo).toBe("reply@solace.test");
  expect(reply.patch.composeCc).toBe("");
  expect(reply.patch.composeBody).toBe(replyAll.patch.composeBody);
  expect(reply.patch.composeHtmlBody).toBe(replyAll.patch.composeHtmlBody);
  expect(reply.identityId).toBe(replyAll.identityId);
});

it("escapes the sender name and plain-text body in the reply quote", () => {
  const seed = buildReplySeed(
    { id: "m1", subject: "Hi", from: [{ name: HOSTILE, email: "a@solace.onl" }], receivedAt: "2026-10-01T10:00:00Z" },
    "1 < 2 & <b>bold</b>",
    [],
    null,
    DATE_OPTIONS,
  );
  const html = seed.patch.composeHtmlBody ?? "";

  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;div data-quoted-html&gt;");
  expect(html).toContain("1 &lt; 2 &amp; &lt;b&gt;bold&lt;/b&gt;");
});

it("escapes the sender and subject in the forward header", () => {
  const seed = buildForwardSeed(
    { id: "m1", subject: HOSTILE, from: [{ name: `Eve ${HOSTILE}`, email: "e@solace.onl" }], receivedAt: "2026-10-01T10:00:00Z" },
    "body",
    [],
    null,
    DATE_OPTIONS,
  );
  const html = seed.patch.composeHtmlBody ?? "";

  expect(html).not.toContain("<img");
  expect(html).toContain("Subject: &lt;div data-quoted-html&gt;");
  expect(html).toContain("From: Eve &lt;div data-quoted-html&gt;");
});
