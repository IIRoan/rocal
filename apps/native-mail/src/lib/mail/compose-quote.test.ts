import { buildForwardBody, buildReplyBody } from "./compose-quote";
import type { JmapEmailMessage } from "./types";

const DATE_OPTIONS = { timeFormat: "24h", timezone: "Europe/Amsterdam" } as const;

function message(overrides: Partial<JmapEmailMessage>): JmapEmailMessage {
  return {
    id: "m1",
    subject: "Plans",
    from: [{ name: "Ann", email: "ann@example.com" }],
    to: [{ email: "me@example.com" }],
    receivedAt: "2026-10-25T08:05:00Z",
    textBody: [{ partId: "1" }],
    bodyValues: { "1": { value: "See you there" } },
    ...overrides,
  };
}

describe("reply and forward quotes", () => {
  it("quotes the sender and date in the user's zone", () => {
    expect(buildReplyBody(message({}), DATE_OPTIONS)).toMatch(
      /On .*2026.*09:05, Ann wrote:\n> See you there$/,
    );
  });

  it.each([undefined, "", "not a date"])(
    "falls back instead of throwing for receivedAt %j",
    (receivedAt) => {
      expect(buildReplyBody(message({ receivedAt }), DATE_OPTIONS)).toContain(
        "On Unknown date, Ann wrote:",
      );
      expect(buildForwardBody(message({ receivedAt }), DATE_OPTIONS)).toContain(
        "Date: Unknown date",
      );
    },
  );

  it("quotes hostile HTML in linear time", () => {
    const hostile = message({
      textBody: [],
      htmlBody: [{ partId: "1" }],
      bodyValues: { "1": { value: "<a x".repeat(16 * 1024) } },
    });
    const started = performance.now();
    buildReplyBody(hostile, DATE_OPTIONS);
    buildForwardBody(hostile, DATE_OPTIONS);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
