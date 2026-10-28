import { afterEach, expect, it } from "@jest/globals";
import { GET } from "../../app/.well-known/apple-app-site-association/route";

const previous = process.env.SOLACE_APPLE_TEAM_ID;
afterEach(() => {
  if (previous === undefined) delete process.env.SOLACE_APPLE_TEAM_ID;
  else process.env.SOLACE_APPLE_TEAM_ID = previous;
});

it.each([undefined, "", "invalid", "ABCDEFGHIJ.another.app"])(
  "does not authorize apps without a valid configured Apple team: %p",
  (team) => {
    if (team === undefined) delete process.env.SOLACE_APPLE_TEAM_ID;
    else process.env.SOLACE_APPLE_TEAM_ID = team;
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  },
);

it("authorizes only the two release apps under the configured team", async () => {
  process.env.SOLACE_APPLE_TEAM_ID = " ABC1234567 ";
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(await response.json()).toEqual({
    webcredentials: {
      apps: ["ABC1234567.onl.solace.calendar", "ABC1234567.onl.solace.mail"],
    },
  });
});
