/** @jest-environment jsdom */

import { expect, it } from "@jest/globals";
import { buildForwardSeed, buildReplySeed } from "@/components/mail/mail-compose-seed";

const HOSTILE = '<div data-quoted-html><img src="x" onerror="window.alert(1)"></div>';
const DATE_OPTIONS = { timeFormat: "24h" as const, timezone: "Europe/Amsterdam" };

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
