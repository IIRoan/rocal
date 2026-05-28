import { describe, expect, it } from "@jest/globals";

import {
  cleanInviteMailHtml,
  cleanInviteMailText,
} from "@/lib/mail/invite-boilerplate";

describe("invite boilerplate cleanup", () => {
  it("removes Google invite separator and Meet boilerplate from plaintext", () => {
    expect(
      cleanInviteMailText(
        [
          "Planning sync",
          "",
          "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~-",
          "Join with Google Meet: https://meet.google.com/jvo-kwba-ijs",
          "Learn more about Meet at: https://support.google.com/meet",
          "Please do not edit this section.",
        ].join("\n"),
      ),
    ).toBe("Planning sync");
  });

  it("removes Google invite boilerplate fragments from HTML", () => {
    const cleaned = cleanInviteMailHtml(
      "<div>Planning sync</div><div>-::~:~::~:~:~:~:~:~-</div><div>Join with Google Meet: https://meet.google.com/jvo-kwba-ijs</div><div>Please do not edit this section.</div>",
    );

    expect(cleaned).toContain("Planning sync");
    expect(cleaned).not.toContain("Join with Google Meet");
    expect(cleaned).not.toContain("Please do not edit this section");
  });
});
